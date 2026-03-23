-- Soft-delete with RGPD-compliant retention period for clients.
-- Legal basis: Ley General Tributaria art. 66 (4 years), Código de Comercio art. 30 (6 years).
-- This function NEVER hard-deletes — it marks clients as inactive with a retention_until date.
-- Related data (quotes, tickets, bookings) is preserved for audit/legal purposes.

CREATE OR REPLACE FUNCTION public.soft_delete_client(
  p_client_id uuid,
  p_company_id uuid,
  p_retention_years int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client record;
  v_retention_until timestamptz;
  v_now timestamptz := now();
BEGIN
  -- Verify client exists and belongs to company
  SELECT id, metadata INTO v_client
    FROM clients
    WHERE id = p_client_id AND company_id = p_company_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Client not found, wrong company, or already deleted');
  END IF;

  v_retention_until := v_now + (p_retention_years || ' years')::interval;

  -- Soft-delete: mark as inactive + set deleted_at + record retention metadata
  UPDATE clients
  SET
    is_active = false,
    deleted_at = v_now,
    updated_at = v_now,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'retention_last_action', 'soft_deleted',
      'retention_action_at', v_now,
      'retention_until', v_retention_until,
      'retention_reason', 'rgpd_legal_retention'
    )
  WHERE id = p_client_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'deactivated',
    'retention_until', v_retention_until
  );
END;
$$;

-- Only service_role can call this (Edge Function uses SERVICE_ROLE_KEY)
REVOKE ALL ON FUNCTION public.soft_delete_client(uuid, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_client(uuid, uuid, int) FROM authenticated;
