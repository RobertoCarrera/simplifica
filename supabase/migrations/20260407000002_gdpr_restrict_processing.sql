-- =====================================================================
-- Migration: gdpr_restrict_processing — Art. 18 RGPD
-- Date: 2026-04-07
-- Reason: Programmatic enforcement of Art. 18 restriction of processing.
--         Previously only accessible via manual ARCO request handling;
--         operators now have an explicit RPC to flag and unflag clients.
--
-- Art. 18 right to restriction is triggered when:
--   (a) accuracy of data is contested by the data subject
--   (b) processing is unlawful but the subject opposes erasure
--   (c) controller no longer needs the data but the subject needs it
--       for establishment, exercise or defence of legal claims
--   (d) the subject has objected to processing under Art. 21(1)
-- =====================================================================

-- 1. Add processing_restricted flag to clients table (idempotent)
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS processing_restricted       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS processing_restriction_reason TEXT,
    ADD COLUMN IF NOT EXISTS processing_restricted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS processing_restricted_by    UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.clients.processing_restricted IS
    'Art. 18 RGPD — if TRUE, no marketing/automation/export may process this client';
COMMENT ON COLUMN public.clients.processing_restriction_reason IS
    'Human-readable reason for the restriction (stored for accountability)';

-- 2. Index for fast flag queries
CREATE INDEX IF NOT EXISTS idx_clients_processing_restricted
    ON public.clients (company_id, processing_restricted)
    WHERE processing_restricted = TRUE;

-- 3. gdpr_restrict_processing(client_id, reason)
--    Sets processing_restricted = TRUE for a client.
--    Callable by owner/admin; logs to gdpr_audit_log.
CREATE OR REPLACE FUNCTION public.gdpr_restrict_processing(
    p_client_id UUID,
    p_reason    TEXT DEFAULT 'Art. 18 RGPD — subject requested restriction'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_company_id UUID;
    v_email      TEXT;
    v_role       TEXT;
BEGIN
    -- 1. Caller must be owner or admin of the client's company
    SELECT c.company_id, c.email
    INTO   v_company_id, v_email
    FROM   public.clients c
    WHERE  c.id = p_client_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Client not found: %', p_client_id;
    END IF;

    SELECT cm.role INTO v_role
    FROM   public.company_members cm
    JOIN   public.users u ON u.id = cm.user_id
    WHERE  u.auth_user_id = v_user_id
      AND  cm.company_id  = v_company_id
      AND  cm.status = 'active';

    IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only owner/admin can restrict processing';
    END IF;

    -- 2. Apply restriction
    UPDATE public.clients
    SET    processing_restricted        = TRUE,
           processing_restriction_reason = p_reason,
           processing_restricted_at     = now(),
           processing_restricted_by     = v_user_id
    WHERE  id = p_client_id;

    -- 3. Audit log
    INSERT INTO public.gdpr_audit_log (
        action_type, table_name, record_id, subject_email,
        purpose, legal_basis, new_values, user_id, company_id
    ) VALUES (
        'restrict',
        'clients',
        p_client_id,
        v_email,
        'Art. 18 RGPD — restriction of processing applied',
        'legal_obligation',
        jsonb_build_object('reason', p_reason, 'restricted_at', now()),
        v_user_id,
        v_company_id
    );

    RETURN jsonb_build_object(
        'success',     TRUE,
        'client_id',   p_client_id,
        'restricted',  TRUE,
        'reason',      p_reason,
        'restricted_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_restrict_processing(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gdpr_restrict_processing(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.gdpr_restrict_processing(UUID, TEXT) IS
    'Art. 18 RGPD — restrict processing for a client. Sets processing_restricted = TRUE and creates audit log entry.';

-- 4. gdpr_lift_processing_restriction(client_id, reason)
--    Lifts a previously set processing restriction.
CREATE OR REPLACE FUNCTION public.gdpr_lift_processing_restriction(
    p_client_id UUID,
    p_reason    TEXT DEFAULT 'Restriction lifted by operator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_company_id UUID;
    v_email      TEXT;
    v_role       TEXT;
BEGIN
    SELECT c.company_id, c.email
    INTO   v_company_id, v_email
    FROM   public.clients c
    WHERE  c.id = p_client_id;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Client not found: %', p_client_id;
    END IF;

    SELECT cm.role INTO v_role
    FROM   public.company_members cm
    JOIN   public.users u ON u.id = cm.user_id
    WHERE  u.auth_user_id = v_user_id
      AND  cm.company_id  = v_company_id
      AND  cm.status = 'active';

    IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only owner/admin can lift processing restrictions';
    END IF;

    UPDATE public.clients
    SET    processing_restricted         = FALSE,
           processing_restriction_reason = NULL,
           processing_restricted_at      = NULL,
           processing_restricted_by      = NULL
    WHERE  id = p_client_id;

    INSERT INTO public.gdpr_audit_log (
        action_type, table_name, record_id, subject_email,
        purpose, legal_basis, new_values, user_id, company_id
    ) VALUES (
        'lift_restriction',
        'clients',
        p_client_id,
        v_email,
        'Art. 18 RGPD — processing restriction lifted',
        'legal_obligation',
        jsonb_build_object('reason', p_reason, 'lifted_at', now()),
        v_user_id,
        v_company_id
    );

    RETURN jsonb_build_object(
        'success',    TRUE,
        'client_id',  p_client_id,
        'restricted', FALSE,
        'reason',     p_reason,
        'lifted_at',  now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_lift_processing_restriction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gdpr_lift_processing_restriction(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.gdpr_lift_processing_restriction(UUID, TEXT) IS
    'Art. 18 RGPD — lift a processing restriction for a client. Clears flag and creates audit log entry.';
