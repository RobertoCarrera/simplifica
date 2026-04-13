-- Migration: 20260325210000_create_security_audit_log.sql
-- Purpose: Create the security_audit_log table for tracking auth/security events.
--
-- SECURITY: SEC-AUD-01, SEC-AUD-02
-- This table is separate from gdpr_audit_log (different retention, RLS, and schema).
-- The security log tracks auth events: login, session invalidation, CSRF rejects,
-- invitation token usage, JWT hook validation results.
--
-- INSERT path: all writes go through the Supabase JS client .insert() (parameterized)
-- or the log_security_event() SQL function (also parameterized via $1..$N).
-- No raw string interpolation is used anywhere in the audit write path.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type   text        NOT NULL,
  event_detail text,
  success      boolean     NOT NULL DEFAULT false,
  user_id      uuid,
  ip_address   text,
  user_agent   text,
  function_name text,
  details      jsonb       DEFAULT '{}'::jsonb,
  created_at   timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.security_audit_log IS
  'Append-only audit log for authentication and security events. '
  'Separate from gdpr_audit_log (different retention and schema). '
  'Only service_role may read or write — no client-side access.';

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service_role (Edge Functions using SUPABASE_SERVICE_ROLE_KEY) can read/write.
-- No authenticated users or anon callers should ever access this table directly.
CREATE POLICY "service_role only"
  ON public.security_audit_log
  USING (auth.role() = 'service_role');

-- ── Parameterized insert function (SEC-AUD-01) ────────────────────────────────
-- Using $1..$N parameters prevents SQL injection regardless of input values.
-- SECURITY DEFINER runs as the function owner (postgres), not the calling role,
-- so Edge Functions with service_role can call it without needing table-level INSERT grants.

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type   text,
  p_event_detail text    DEFAULT NULL,
  p_success      boolean DEFAULT false,
  p_user_id      uuid    DEFAULT NULL,
  p_ip_address   text    DEFAULT NULL,
  p_user_agent   text    DEFAULT NULL,
  p_function_name text   DEFAULT NULL,
  p_details      jsonb   DEFAULT '{}'::jsonb
) RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  INSERT INTO public.security_audit_log (
    event_type,
    event_detail,
    success,
    user_id,
    ip_address,
    user_agent,
    function_name,
    details
  ) VALUES (
    p_event_type,
    p_event_detail,
    p_success,
    p_user_id,
    p_ip_address,
    p_user_agent,
    p_function_name,
    p_details
  );
$$;

COMMENT ON FUNCTION public.log_security_event IS
  'Parameterized security audit log writer. '
  'Use this instead of raw INSERT to guarantee SQL injection safety. '
  'SEC-AUD-01: All parameters are bound via $1..$N — no string interpolation.';

-- ── Index for common query patterns ──────────────────────────────────────────

-- Admin dashboards will typically filter by event_type and time range
CREATE INDEX IF NOT EXISTS security_audit_log_event_type_idx
  ON public.security_audit_log (event_type, created_at DESC);

-- Lookups by user (for incident investigation)
CREATE INDEX IF NOT EXISTS security_audit_log_user_id_idx
  ON public.security_audit_log (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
