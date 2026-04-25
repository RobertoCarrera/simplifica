-- Migration: delete_retention_record RPC function
-- Replaces the Edge Function delete-retention-record with a SECURITY DEFINER RPC
-- Date: 20260409

CREATE OR REPLACE FUNCTION delete_retention_record(p_table_name text, p_record_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_tables text[] := ARRAY[
    'clients',
    'invoices',
    'quotes',
    'bookings',
    'booking_clinical_notes',
    'client_clinical_notes',
    'booking_documents',
    'gdpr_consent_records',
    'audit_logs'
  ];
  policy_record RECORD;
  record_created_at TIMESTAMPTZ;
  cutoff_date TIMESTAMPTZ;
  expires_at TIMESTAMPTZ;
  rows_affected INT;
BEGIN
  -- Validate table_name against allowlist
  IF p_table_name IS NULL OR p_table_name NOT LIKE '_%' ESCAPE '' THEN
    -- Use simple array check
    IF NOT (p_table_name = ANY(allowed_tables)) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'invalid_table'
      );
    END IF;
  ELSE
    IF p_table_name != 'clients' AND p_table_name != 'invoices' AND 
       p_table_name != 'quotes' AND p_table_name != 'bookings' AND
       p_table_name != 'booking_clinical_notes' AND p_table_name != 'client_clinical_notes' AND
       p_table_name != 'booking_documents' AND p_table_name != 'gdpr_consent_records' AND
       p_table_name != 'audit_logs' THEN
      RETURN json_build_object(
        'success', false,
        'error', 'invalid_table'
      );
    END IF;
  END IF;

  -- Validate p_record_id is a valid UUID (already typed as uuid, but check not null)
  IF p_record_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'invalid_id'
    );
  END IF;

  -- Look up the retention policy
  SELECT * INTO policy_record
  FROM retention_policies
  WHERE table_name = p_table_name AND is_active = true;

  -- Check if record exists using dynamic SQL
  EXECUTE format('SELECT created_at FROM %I WHERE id = $1', p_table_name)
  USING p_record_id
  INTO record_created_at;

  -- If record doesn't exist
  IF record_created_at IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'not_found'
    );
  END IF;

  -- If there's an active retention policy, check if protected
  IF policy_record IS NOT NULL THEN
    -- Calculate expiration date
    expires_at := record_created_at + (policy_record.retention_days || ' days')::INTERVAL;
    cutoff_date := now();

    -- Check if record is protected (not yet expired)
    IF expires_at > cutoff_date THEN
      RETURN json_build_object(
        'success', false,
        'error', 'protegido',
        'legal_basis', policy_record.legal_basis,
        'expires_at', expires_at
      );
    END IF;
  END IF;

  -- If no policy exists or record is expired, delete the record
  EXECUTE format('DELETE FROM %I WHERE id = $1', p_table_name)
  USING p_record_id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'not_found'
    );
  END IF;

  RETURN json_build_object(
    'success', true
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_retention_record(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_retention_record(text, text) TO anon;
