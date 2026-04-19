-- ============================================================
-- Data Access Audit: Log who accessed which client's data
-- Created: 2026-04-19
-- ============================================================

-- RPC to get access history for a specific client
-- Returns: user_id, user_name, accessed_at, table_name, action_type, purpose
CREATE OR REPLACE FUNCTION public.get_client_access_history(
  p_client_id UUID
)
RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  accessed_at TIMESTAMPTZ,
  table_name TEXT,
  action_type TEXT,
  purpose TEXT,
  record_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gal.user_id,
    COALESCE(
      u.display_name,
      u.full_name,
      pr.display_name,
      'Usuario desconocido'
    )::TEXT AS user_name,
    gal.created_at AS accessed_at,
    gal.table_name,
    gal.action_type,
    COALESCE(gal.purpose, 'Acceso a datos del cliente')::TEXT AS purpose,
    gal.record_id
  FROM public.gdpr_audit_log gal
  LEFT JOIN public.users u ON u.id = gal.user_id
  LEFT JOIN public.professionals pr ON pr.user_id = gal.user_id
  WHERE gal.record_id = p_client_id
    AND gal.action_type = 'data_access'
  ORDER BY gal.created_at DESC
  LIMIT 200;
END;
$$;

-- Policy to allow company members to see access history for their clients
CREATE POLICY "Company members can view client access history"
ON public.gdpr_audit_log
FOR SELECT
USING (
  company_id = COALESCE(
    current_setting('request.jwt.claim.company_id', true)::uuid,
    (SELECT company_id FROM professionals WHERE user_id = auth.uid() LIMIT 1)
  )
);

-- Comment on the new action_type usage
COMMENT ON FUNCTION public.get_client_access_history(UUID) IS
'Returns the data access audit log for a specific client, showing who accessed the data and when.';
