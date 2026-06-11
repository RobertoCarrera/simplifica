-- ============================================
-- Migration: company_plan_subscriptions + RPCs
-- Paso 1/4 del EPIC t_919890f1 (Planes y Precios admin + owner)
--
-- Tabla `company_plan_subscriptions`:
--   - Histórico de qué plan ha tenido cada company.
--   - Una sola fila con status='active' por company (índice parcial único).
--   - FK a plans(id) (text PK en plans) y companies(id) (uuid).
--
-- RPCs SECURITY DEFINER (mismo patrón que admin_upsert_plan):
--   - change_company_plan(company_id, plan_id): owner de la company o super_admin
--     cambia el plan de su propia company. Cierra la suscripción activa previa
--     y crea una nueva en una transacción. Sincroniza companies.subscription_tier.
--   - admin_assign_company_plan(company_id, plan_id, notes?): solo super_admin
--     asigna un plan a cualquier company (override). Mismo sync.
--
-- Decisiones:
--   - No se crean policies directas de INSERT/UPDATE/DELETE — todo va por RPC.
--   - subscription_tier (legacy TEXT en companies) se mantiene sincronizado
--     con el plan_id activo para no romper UI existente.
--   - RLS SELECT: owner/admin/supervisor/super_admin de la company, o super_admin global.
-- ============================================

-- ── TABLA company_plan_subscriptions ─────────────────────────
CREATE TABLE IF NOT EXISTS public.company_plan_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id           text NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','trialing')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  assigned_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.company_plan_subscriptions IS 'Histórico de planes contratados por cada company. Una fila activa por company (índice parcial). Mutaciones solo vía RPC.';
COMMENT ON COLUMN public.company_plan_subscriptions.status IS 'active = plan vigente; cancelled = reemplazado; expired = baja; trialing = periodo de prueba';
COMMENT ON COLUMN public.company_plan_subscriptions.assigned_by IS 'users.id (no auth.uid) del usuario que asignó/cambió el plan';

-- Una sola suscripción activa por company. El histórico se conserva en status='cancelled'.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_sub_per_company
  ON public.company_plan_subscriptions(company_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subs_company ON public.company_plan_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subs_plan ON public.company_plan_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON public.company_plan_subscriptions(status);

-- ── TRIGGER updated_at ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_company_plan_subs_updated_at ON public.company_plan_subscriptions;
CREATE TRIGGER trg_company_plan_subs_updated_at
  BEFORE UPDATE ON public.company_plan_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.company_plan_subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: owner/admin/supervisor/super_admin de la company, o super_admin global.
DROP POLICY IF EXISTS subs_select ON public.company_plan_subscriptions;
CREATE POLICY subs_select ON public.company_plan_subscriptions FOR SELECT TO authenticated
  USING (
    -- super_admin global
    public.is_super_admin_by_internal_id(
      (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1)
    )
    OR
    -- miembro con rol relevante de la company
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = company_plan_subscriptions.company_id
        AND cm.status = 'active'
        AND cm.role_id IN (
          SELECT id FROM public.app_roles
          WHERE name IN ('owner','admin','supervisor','super_admin')
        )
    )
  );

-- NO se crean policies de INSERT/UPDATE/DELETE — todo va por RPC SECURITY DEFINER.

-- ── RPC: change_company_plan (owner o super_admin) ───────────
CREATE OR REPLACE FUNCTION public.change_company_plan(
  p_company_id uuid,
  p_plan_id    text
) RETURNS public.company_plan_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_role_name   text;
  v_sub         public.company_plan_subscriptions;
BEGIN
  -- Resolver internal user.id y role desde auth.uid()
  SELECT u.id, r.name
    INTO v_user_id, v_role_name
  FROM public.users u
  LEFT JOIN public.app_roles r ON r.id = u.app_role_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Permission denied: user not found';
  END IF;

  -- Permitir si: (a) super_admin global, o (b) owner activo de la company objetivo
  IF v_role_name IS DISTINCT FROM 'super_admin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.user_id = v_user_id
        AND cm.company_id = p_company_id
        AND cm.status = 'active'
        AND r.name = 'owner'
    ) THEN
      RAISE EXCEPTION 'Permission denied: must be owner of the company or super_admin';
    END IF;
  END IF;

  -- Validar que el plan existe y está activo
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plan % not found or inactive', p_plan_id;
  END IF;

  -- Cerrar suscripción activa previa (si existe)
  UPDATE public.company_plan_subscriptions
     SET status = 'cancelled', ended_at = now(), updated_at = now()
   WHERE company_id = p_company_id
     AND status = 'active';

  -- Crear nueva suscripción
  INSERT INTO public.company_plan_subscriptions
    (company_id, plan_id, status, assigned_by)
  VALUES
    (p_company_id, p_plan_id, 'active', v_user_id)
  RETURNING * INTO v_sub;

  -- Mantener companies.subscription_tier sincronizado (legacy, sin romper UI actual)
  UPDATE public.companies
     SET subscription_tier = p_plan_id, updated_at = now()
   WHERE id = p_company_id;

  RETURN v_sub;
END;
$$;

DROP FUNCTION IF EXISTS public.get_current_company_plan(uuid);
CREATE OR REPLACE FUNCTION public.get_current_company_plan(
  p_company_id uuid
) RETURNS TABLE (
  subscription_id  uuid,
  plan_id         text,
  plan_name       text,
  base_price_cents integer,
  included_users  integer,
  started_at      timestamptz,
  status          text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    s.id,
    s.plan_id,
    p.name,
    p.base_price_cents,
    p.included_users,
    s.started_at,
    s.status
  FROM public.company_plan_subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.company_id = p_company_id
    AND s.status = 'active'
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.admin_assign_company_plan(uuid, text, text);
CREATE OR REPLACE FUNCTION public.admin_assign_company_plan(
  p_company_id uuid,
  p_plan_id    text,
  p_notes      text DEFAULT NULL
) RETURNS public.company_plan_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_role_name text;
  v_sub       public.company_plan_subscriptions;
BEGIN
  SELECT u.id, r.name
    INTO v_user_id, v_role_name
  FROM public.users u
  LEFT JOIN public.app_roles r ON r.id = u.app_role_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_role_name IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plan % not found or inactive', p_plan_id;
  END IF;

  -- Cerrar activa previa
  UPDATE public.company_plan_subscriptions
     SET status = 'cancelled', ended_at = now(), updated_at = now()
   WHERE company_id = p_company_id
     AND status = 'active';

  INSERT INTO public.company_plan_subscriptions
    (company_id, plan_id, status, assigned_by, notes)
  VALUES
    (p_company_id, p_plan_id, 'active', v_user_id, p_notes)
  RETURNING * INTO v_sub;

  UPDATE public.companies
     SET subscription_tier = p_plan_id, updated_at = now()
   WHERE id = p_company_id;

  RETURN v_sub;
END;
$$;

-- ── GRANTS ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.change_company_plan(uuid, text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_company_plan(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_company_plan(uuid, text, text)      TO authenticated;
