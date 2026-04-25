-- Migration: 20260409_retention_summary_rpc
-- Replaces Edge Function retention-summary with PostgreSQL RPC
-- Date: 2026-04-09

-- Drop existing function if exists
DROP FUNCTION IF EXISTS retention_summary();

CREATE OR REPLACE FUNCTION retention_summary()
RETURNS TABLE (
  category text,
  table_name text,
  retention_days integer,
  legal_basis text,
  description text,
  total bigint,
  protected_count bigint,
  expired_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy_record RECORD;
  v_total bigint;
  v_protected bigint;
  v_expired bigint;
  cutoff_date TIMESTAMPTZ;
BEGIN
  -- Ensure search_path is set
  SET search_path = public;

  FOR policy_record IN
    SELECT rp.category, rp.table_name, rp.retention_days, rp.legal_basis, rp.description
    FROM retention_policies rp
    WHERE rp.is_active = true
    ORDER BY rp.category
  LOOP
    -- Calculate cutoff date for this policy
    cutoff_date := now() - (policy_record.retention_days || ' days')::INTERVAL;

    -- Build dynamic query to get counts using format with USING
    EXECUTE format(
      'SELECT count(*)::bigint, 
              count(*) FILTER (WHERE created_at > $1)::bigint,
              count(*) FILTER (WHERE created_at <= $1)::bigint
       FROM %I',
      policy_record.table_name
    ) USING cutoff_date
    INTO v_total, v_protected, v_expired;

    -- Assign to output variables
    category := policy_record.category;
    table_name := policy_record.table_name;
    retention_days := policy_record.retention_days;
    legal_basis := policy_record.legal_basis;
    description := policy_record.description;
    total := COALESCE(v_total, 0);
    protected_count := COALESCE(v_protected, 0);
    expired_count := COALESCE(v_expired, 0);
    
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION retention_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION retention_summary() TO anon;
