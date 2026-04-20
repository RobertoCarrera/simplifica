-- Fix: gdpr_log_access uses p_* prefixed params but all callers pass unprefixed names.
-- PostgREST matches RPC calls by named arguments → 404 when names don't match.
-- Solution: recreate the function without the p_ prefix.

CREATE OR REPLACE FUNCTION public.gdpr_log_access(
  user_id      uuid    DEFAULT auth.uid(),
  company_id   uuid    DEFAULT NULL,
  action_type  text    DEFAULT 'data_access',
  table_name   text    DEFAULT NULL,
  record_id    uuid    DEFAULT NULL,
  subject_email text   DEFAULT NULL,
  purpose      text    DEFAULT NULL,
  old_values   jsonb   DEFAULT NULL,
  new_values   jsonb   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.gdpr_audit_log (
    user_id, company_id, action_type, table_name,
    record_id, subject_email, purpose, old_values, new_values, created_at
  )
  VALUES (
    user_id, company_id, action_type, table_name,
    record_id, subject_email, purpose, old_values, new_values, NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gdpr_log_access(uuid, uuid, text, text, uuid, text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_log_access(uuid, uuid, text, text, uuid, text, text, jsonb, jsonb) TO service_role;
