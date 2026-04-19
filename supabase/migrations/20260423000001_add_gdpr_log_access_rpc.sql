-- Migration: Add gdpr_log_access RPC
-- Part of GDPR data access audit (subagent #4)
--
-- Purpose: Generic RPC to log any access/modification event to gdpr_audit_log
-- Used by:
--   - GdprComplianceService.logGdprEvent()
--   - GdprComplianceService.logDataAccess()
--   - Edge functions (data-retention-policy, upsert-client)
--
-- action_type values: 'data_access', 'data_modification', 'consent_change', 'breach_reported',
--                      'retention_policy', 'access_request', 'migration'

CREATE OR REPLACE FUNCTION public.gdpr_log_access(
  p_user_id UUID DEFAULT auth.uid(),
  p_company_id UUID DEFAULT NULL,
  p_action_type TEXT DEFAULT 'data_access',
  p_table_name TEXT DEFAULT NULL,
  p_record_id UUID DEFAULT NULL,
  p_subject_email TEXT DEFAULT NULL,
  p_purpose TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.gdpr_audit_log (
    user_id,
    company_id,
    action_type,
    table_name,
    record_id,
    subject_email,
    purpose,
    old_values,
    new_values,
    created_at
  ) VALUES (
    p_user_id,
    p_company_id,
    p_action_type,
    p_table_name,
    p_record_id,
    p_subject_email,
    p_purpose,
    p_old_values,
    p_new_values,
    NOW()
  );
END;
$$;

-- Allow authenticated users to call this RPC
GRANT EXECUTE ON FUNCTION public.gdpr_log_access TO authenticated;

COMMENT ON FUNCTION public.gdpr_log_access IS
'Generic GDPR audit log writer. Logs data access and modification events to gdpr_audit_log. Used by GdprComplianceService, edge functions, and database triggers.';
