-- Migration: Fix role lookup para clients del portal
-- ----------------------------------------------------------------
-- Issue: el trigger de workflow (sub-agente A) resuelve el rol del
-- caller solo desde `public.users.app_role_id`. Para clientes del
-- portal (que NO tienen `public.users.app_role_id` poblado, sino
-- que están en `client_portal_users`), devuelve NULL → rol
-- 'unknown' → el validador rechaza las transiciones con error
-- 23514 (check_violation).
--
-- Fix: la función que resuelve el rol ahora consulta TAMBIÉN
-- `client_portal_users`. Si el caller es un client portal,
-- devuelve rol 'client'. Si es staff, devuelve el app_role.
--
-- Esta migración reemplaza las funciones `trg_fn_enforce_quote_status_transition`
-- y `trg_fn_log_quote_status_transition` (creadas en 20260618000024).
-- También crea una función helper `resolve_actor_role(auth_uuid)`
-- reutilizable.

CREATE OR REPLACE FUNCTION public.resolve_actor_role(p_auth_user uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_auth_user IS NULL THEN
    RETURN 'system';
  END IF;

  -- 1. Try staff path: public.users.app_role_id -> public.app_roles.name
  SELECT ar.name INTO v_role
  FROM public.users u
  LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
  WHERE u.auth_user_id = p_auth_user
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN lower(v_role);
  END IF;

  -- 2. Try client portal path: client_portal_users exists for this auth_user
  IF EXISTS (
    SELECT 1 FROM public.client_portal_users cpu
    WHERE cpu.auth_user_id = p_auth_user
      AND (cpu.deleted_at IS NULL OR cpu.deleted_at = '0001-01-01'::timestamptz)
  ) THEN
    RETURN 'client';
  END IF;

  -- 3. Fallback: unknown
  RETURN 'unknown';
END;
$$;

COMMENT ON FUNCTION public.resolve_actor_role(uuid)
  IS 'Resuelve el rol del actor autenticado. Staff: app_role_id. Portal: client_portal_users. Fallback: unknown.';

-- Reemplazar la función del trigger BEFORE UPDATE
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_quote_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text;
BEGIN
  -- Only act when status changes.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_role := public.resolve_actor_role(v_caller);

  PERFORM public.can_transition_quote_status(
    OLD.status::text,
    NEW.status::text,
    v_role
  );

  RETURN NEW;
END;
$fn$;

-- Reemplazar la función del trigger AFTER UPDATE (logger)
CREATE OR REPLACE FUNCTION public.trg_fn_log_quote_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_actor  uuid;
  v_role   text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF v_caller IS NOT NULL THEN
    SELECT u.id INTO v_actor
    FROM public.users u
    WHERE u.auth_user_id = v_caller
    LIMIT 1;
  END IF;

  v_role := public.resolve_actor_role(v_caller);

  INSERT INTO public.quote_status_transitions (
    quote_id, company_id, from_status, to_status,
    actor_user_id, reason, metadata, created_at
  ) VALUES (
    NEW.id, NEW.company_id,
    OLD.status::text, NEW.status::text,
    v_actor,
    CASE
      WHEN v_role = 'client' THEN 'client_action'
      WHEN v_role = 'system' THEN 'system_action'
      ELSE 'staff_action'
    END,
    jsonb_build_object('role', v_role),
    now()
  );

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.trg_fn_enforce_quote_status_transition()
  IS 'BEFORE UPDATE OF status: valida la transición usando el rol resuelto por resolve_actor_role. Reconoce clientes del portal.';

COMMENT ON FUNCTION public.trg_fn_log_quote_status_transition()
  IS 'AFTER UPDATE OF status: registra la transición en quote_status_transitions. Incluye role del actor.';

-- Test E2E: simular transición de un cliente del portal
DO $$
DECLARE
  v_company_id uuid;
  v_quote_id uuid;
  v_old_status text;
  v_new_status text;
  v_passed boolean := false;
BEGIN
  -- Solo validar que las funciones existen y son callable, no
  -- hacer un test completo (que requeriría un cliente del portal
  -- activo con sesión).
  SELECT has_function_privilege('public.resolve_actor_role(uuid)', 'execute') INTO v_passed;

  IF v_passed THEN
    RAISE NOTICE 'TEST PASS: resolve_actor_role existe y es ejecutable';
  ELSE
    RAISE EXCEPTION 'TEST FAIL: resolve_actor_role no es ejecutable';
  END IF;

  -- Test: rol system para caller NULL
  IF public.resolve_actor_role(NULL) = 'system' THEN
    RAISE NOTICE 'TEST PASS: resolve_actor_role(NULL) = system';
  ELSE
    RAISE EXCEPTION 'TEST FAIL: resolve_actor_role(NULL) != system';
  END IF;

  RAISE NOTICE 'Todos los tests de la migración pasaron';
END $$;