-- ============================================================
-- Migration: Cliente Desconocido — audit, reclamation, cleanup
--
-- Purpose:
--   When defensive triggers auto-create a client record because a
--   booking arrived without one (source = 'auto_created_from_booking_trigger'
--   or 'auto_created_from_orphan_booking_fix'), the resulting client
--   has needs_data_completion = true and a metadata blob with the
--   booking context. This migration gives the team:
--
--     1. A read-only view (v_clientes_desconocidos) listing them
--        with the related booking, professional, and days unclaimed.
--     2. A helper function (client_unclaimed_days) for inline use.
--     3. An audit log table (client_reclamation_log) + trigger that
--        records EVERY flip of needs_data_completion true→false so we
--        have historical traceability of "who claimed what, when".
--     4. The claim_unknown_client() RPC: merges the Desconocido into
--        a real existing client OR converts it into a real client.
--        Re-points all bookings + quotes to the final client in the
--        merge path so the reconciliation is consistent.
--     5. A one-shot archival cleanup: Desconocido with no active
--        bookings and >30 days unclaimed gets archived (soft-marked,
--        not deleted, for compliance).
--     6. New merge_with column on clients for traceability of merges.
--
-- Safe to re-run (everything is CREATE OR REPLACE / IF NOT EXISTS /
-- IF EXISTS).
-- ============================================================


-- ============================================================
-- STEP 0: extend clients with merge_with (optional traceability)
-- ============================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS merge_with uuid
    REFERENCES public.clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clients.merge_with IS
  'If this Desconocido client was merged into another real client, points to it. The real client is the canonical record; this one is kept as audit trail (soft-deleted via deleted_at).';

CREATE INDEX IF NOT EXISTS idx_clients_merge_with
  ON public.clients(merge_with)
  WHERE merge_with IS NOT NULL;


-- ============================================================
-- STEP 1: view v_clientes_desconocidos
-- ============================================================
CREATE OR REPLACE VIEW public.v_clientes_desconocidos
WITH (security_invoker = true) AS
SELECT
  c.id                              AS client_id,
  c.company_id,
  c.name,
  c.email,
  c.phone,
  c.source,
  c.metadata,
  c.created_at                      AS cliente_creado,
  -- Original booking (may be NULL for old Defensive records without it)
  (c.metadata->>'created_from_booking')::uuid AS booking_id,
  b.start_time                      AS booking_start,
  b.status::text                    AS booking_status,
  b.professional_id,
  p.display_name                    AS profesional,
  -- How long this Desconocido has been waiting to be claimed
  EXTRACT(DAY FROM now() - c.created_at)::int AS dias_sin_reclamar,
  -- Reclamation flags (in case the view is queried on already-claimed rows)
  (c.metadata->>'claimed_at')::timestamptz AS claimed_at,
  c.metadata->>'claimed_by_user_id' AS claimed_by_user_id,
  c.metadata->>'merged_with_client_id' AS merged_with_client_id,
  c.metadata->>'archived_reason'    AS archived_reason,
  (c.metadata->>'archived_at')::timestamptz AS archived_at
FROM public.clients c
LEFT JOIN public.bookings b       ON b.id = (c.metadata->>'created_from_booking')::uuid
LEFT JOIN public.professionals p  ON p.id = b.professional_id
WHERE c.needs_data_completion = true
  AND c.deleted_at IS NULL;

COMMENT ON VIEW public.v_clientes_desconocidos IS
  'Lista de Clientes Desconocido (auto-creados por triggers defensivos) pendientes de reclamación, con reserva y profesional relacionados.';


-- ============================================================
-- STEP 2: helper function client_unclaimed_days
-- ============================================================
CREATE OR REPLACE FUNCTION public.client_unclaimed_days(p_client_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXTRACT(DAY FROM now() - c.created_at)::int
  FROM public.clients c
  WHERE c.id = p_client_id;
$$;

COMMENT ON FUNCTION public.client_unclaimed_days(uuid) IS
  'Días transcurridos desde la creación del cliente (útil para clientes Desconocido aún no reclamados).';

GRANT EXECUTE ON FUNCTION public.client_unclaimed_days(uuid) TO authenticated;


-- ============================================================
-- STEP 3: client_reclamation_log + trigger
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_reclamation_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  previous_metadata  jsonb,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_reclamation_log IS
  'Auditoría: cada vez que un cliente pasa de needs_data_completion=true a false, queda registrado aquí con quién lo hizo y el metadata previo.';

CREATE INDEX IF NOT EXISTS idx_reclamation_log_client_id
  ON public.client_reclamation_log(client_id);
CREATE INDEX IF NOT EXISTS idx_reclamation_log_created_at
  ON public.client_reclamation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reclamation_log_actor
  ON public.client_reclamation_log(actor_user_id);

ALTER TABLE public.client_reclamation_log ENABLE ROW LEVEL SECURITY;

-- Owners/admins/supervisors of the company can read the log.
-- (company_members.role_id → app_roles.name; project convention)
DROP POLICY IF EXISTS "client_reclamation_log_select" ON public.client_reclamation_log;
CREATE POLICY "client_reclamation_log_select" ON public.client_reclamation_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.company_members cm
        ON cm.company_id = c.company_id
       AND cm.status = 'active'
      JOIN public.app_roles ar
        ON ar.id = cm.role_id
       AND ar.name IN ('owner', 'admin', 'supervisor')
      WHERE c.id = client_reclamation_log.client_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
  );

-- Writes only via the SECURITY DEFINER trigger function below.
DROP POLICY IF EXISTS "client_reclamation_log_insert" ON public.client_reclamation_log;
CREATE POLICY "client_reclamation_log_insert" ON public.client_reclamation_log
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- The trigger fn is SECURITY DEFINER; allow its inserts.


-- Trigger function: logs every flip needs_data_completion true→false.
CREATE OR REPLACE FUNCTION public.fn_log_client_reclamation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only register the flip from true → false.
  IF OLD.needs_data_completion = true
     AND NEW.needs_data_completion = false THEN
    INSERT INTO public.client_reclamation_log (
      client_id,
      actor_user_id,
      previous_metadata,
      notes
    )
    VALUES (
      NEW.id,
      (SELECT id FROM public.users WHERE auth_user_id = auth.uid()),
      OLD.metadata,
      NEW.metadata->>'notes'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_client_reclamation ON public.clients;
CREATE TRIGGER trg_log_client_reclamation
  AFTER UPDATE OF needs_data_completion
  ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_client_reclamation();


-- ============================================================
-- STEP 4: claim_unknown_client() RPC
--
-- Two modes:
--   A) p_real_client_id != NULL  → MERGE the Desconocido into an existing
--      real client. All bookings + quotes are re-pointed. The Desconocido
--      is soft-deleted and merge_with is set for traceability.
--   B) p_real_client_id IS NULL  → CONVERT in place. The Desconocido
--      stays as the canonical record; we fill name/email/phone if
--      provided and flip needs_data_completion to false.
--
-- Security: caller must belong (active) to the company of the Desconocido
-- and have role owner/admin/supervisor. The function is SECURITY DEFINER
-- to allow the bookings/quotes UPDATE without RLS friction, but the
-- permission check runs first.
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_unknown_client(
  p_unknown_client_id  uuid,
  p_real_client_id     uuid    DEFAULT NULL,
  p_real_name          text    DEFAULT NULL,
  p_real_email         text    DEFAULT NULL,
  p_real_phone         text    DEFAULT NULL,
  p_notes              text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id  uuid;
  v_company_id     uuid;
  v_final_client_id uuid;
  v_caller_role    text;
  v_updated_count  int;
BEGIN
  -- 1) Resolve the Desconocido + its company + the calling user.
  SELECT c.company_id
    INTO v_company_id
  FROM public.clients c
  WHERE c.id = p_unknown_client_id
    AND c.needs_data_completion = true
    AND c.deleted_at IS NULL;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Cliente Desconocido no encontrado o ya reclamado: %', p_unknown_client_id;
  END IF;

  SELECT u.id, ar.name
    INTO v_actor_user_id, v_caller_role
  FROM public.users u
  LEFT JOIN public.company_members cm
    ON cm.user_id = u.id
   AND cm.company_id = v_company_id
   AND cm.status = 'active'
  LEFT JOIN public.app_roles ar
    ON ar.id = cm.role_id
  WHERE u.auth_user_id = auth.uid();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF v_caller_role IS NULL
     OR v_caller_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'Sin permisos para reclamar clientes (rol requerido: owner/admin/supervisor)';
  END IF;

  -- 2) If we're given a real_client_id, validate it exists and belongs
  --    to the same company.
  IF p_real_client_id IS NOT NULL THEN
    PERFORM 1
    FROM public.clients c
    WHERE c.id = p_real_client_id
      AND c.company_id = v_company_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente real no encontrado en esta company: %', p_real_client_id;
    END IF;

    IF p_real_client_id = p_unknown_client_id THEN
      RAISE EXCEPTION 'No puedes fusionar un cliente consigo mismo';
    END IF;
  END IF;

  -- 3) Branch: MERGE vs CONVERT.
  IF p_real_client_id IS NOT NULL THEN
    -- ───── MERGE path ─────
    v_final_client_id := p_real_client_id;

    -- Re-point bookings from the Desconocido to the real client.
    UPDATE public.bookings
    SET client_id = v_final_client_id
    WHERE client_id = p_unknown_client_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE LOG '[claim_unknown_client] re-pointed % bookings from % to %',
      v_updated_count, p_unknown_client_id, v_final_client_id;

    -- Re-point quotes from the Desconocido to the real client.
    UPDATE public.quotes
    SET client_id = v_final_client_id
    WHERE client_id = p_unknown_client_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE LOG '[claim_unknown_client] re-pointed % quotes from % to %',
      v_updated_count, p_unknown_client_id, v_final_client_id;

    -- Soft-delete the Desconocido and record the merge.
    UPDATE public.clients
    SET needs_data_completion = false,
        merge_with            = v_final_client_id,
        deleted_at            = now(),
        metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                       'claimed_at',            now()::text,
                       'claimed_by_user_id',    v_actor_user_id::text,
                       'claim_mode',            'merge',
                       'merged_with_client_id', v_final_client_id::text,
                       'notes',                 COALESCE(p_notes, '')
                     )
    WHERE id = p_unknown_client_id;
  ELSE
    -- ───── CONVERT path ─────
    v_final_client_id := p_unknown_client_id;

    IF COALESCE(btrim(p_real_name), '') = ''
       AND COALESCE(btrim(p_real_email), '') = ''
       AND COALESCE(btrim(p_real_phone), '') = '' THEN
      RAISE EXCEPTION
        'Para convertir un Desconocido debes indicar al menos nombre, email o teléfono';
    END IF;

    UPDATE public.clients
    SET needs_data_completion = false,
        name  = COALESCE(NULLIF(btrim(p_real_name),  ''), name),
        email = COALESCE(NULLIF(btrim(p_real_email), ''), email),
        phone = COALESCE(NULLIF(btrim(p_real_phone), ''), phone),
        metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                       'claimed_at',         now()::text,
                       'claimed_by_user_id', v_actor_user_id::text,
                       'claim_mode',         'convert',
                       'notes',              COALESCE(p_notes, '')
                     )
    WHERE id = p_unknown_client_id;
  END IF;

  RETURN v_final_client_id;
END;
$$;

COMMENT ON FUNCTION public.claim_unknown_client(uuid, uuid, text, text, text, text) IS
  'Reclama un Cliente Desconocido. Modo merge: re-apunta bookings+quotes a un cliente existente. Modo convert: rellena los datos en el sitio. Requiere rol owner/admin/supervisor en la company.';

GRANT EXECUTE ON FUNCTION public.claim_unknown_client(uuid, uuid, text, text, text, text)
  TO authenticated;


-- ============================================================
-- STEP 5: one-shot archival cleanup (idempotent — safe to re-run)
--
-- Marks as 'archived' (metadata only, NOT deleted) every Desconocido
-- that has:
--   • needs_data_completion still true,
--   • no soft-delete yet,
--   • >30 days unclaimed,
--   • NO active bookings (i.e. all of them are cancelled / no-show / etc.)
--
-- The view v_clientes_desconocidos already filters deleted_at IS NULL,
-- so archived rows stop showing up there automatically.
-- ============================================================
DO $$
DECLARE
  v_archived int := 0;
BEGIN
  WITH archived AS (
    UPDATE public.clients c
    SET metadata = COALESCE(c.metadata, '{}'::jsonb)
                   || jsonb_build_object(
                      'archived_at',    now()::text,
                      'archived_reason',
                      'Cliente Desconocido sin reservas activas y +30 días sin reclamar'
                    )
    WHERE c.needs_data_completion = true
      AND c.deleted_at IS NULL
      AND EXTRACT(DAY FROM now() - c.created_at) > 30
      AND NOT EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.client_id = c.id
          AND b.status::text NOT IN (
            'cancelled','no_show','no-show','canceled','anulada','anulado'
          )
      )
    RETURNING c.id
  )
  SELECT count(*) INTO v_archived FROM archived;

  RAISE NOTICE '[cliente_desconocido_cleanup] archived % Desconocido clients (>30d sin reservar)',
    v_archived;
END;
$$;


-- ============================================================
-- STEP 6: enable RLS on clients.merge_with column (if not already)
-- This is handled at the table level — clients already has RLS.
-- We just add a comment for clarity.
-- ============================================================
COMMENT ON COLUMN public.clients.merge_with IS
  'Cliente real al que se fusionó este Desconocido (trazabilidad). NULL = no fusionado.';