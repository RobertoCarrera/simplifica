-- Migration: 20260409_retention_records_rpc
-- Replaces Edge Function retention-records with PostgreSQL RPC
-- Date: 2026-04-09

-- Drop existing function if exists
DROP FUNCTION IF EXISTS retention_records(text, text, integer, integer);

CREATE OR REPLACE FUNCTION retention_records(
  p_category text,
  p_filter text DEFAULT 'all',
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy_record RECORD;
  v_table_name text;
  v_created_at_col text;
  v_retention_days integer;
  v_cutoff_date TIMESTAMPTZ;
  v_offset integer;
  v_total bigint;
  v_total_pages integer;
  v_linked_name text;
  v_client_name text;
  v_linked_entity text;
  v_record_id text;
  v_short_id text;
  v_status text;
  v_expires_at TIMESTAMPTZ;
  v_created_at TIMESTAMPTZ;
  v_age_days integer;
  v_name_parts text[];
  v_first_name text;
  v_last_initial text;
  
  v_row RECORD;
  v_records_arr jsonb := '[]'::jsonb;
BEGIN
  -- Ensure search_path is set
  SET search_path = public;

  -- Validate category
  IF p_category IS NULL OR p_category = '' THEN
    RETURN json_build_object(
      'error', 'Missing required parameter: category'
    );
  END IF;

  -- Look up the retention policy for this category
  SELECT table_name, created_at_column, retention_days INTO v_table_name, v_created_at_col, v_retention_days
  FROM retention_policies
  WHERE category = p_category AND is_active = true
  LIMIT 1;

  IF v_table_name IS NULL THEN
    RETURN json_build_object(
      'error', 'Invalid or unknown category'
    );
  END IF;

  -- Calculate cutoff date
  v_cutoff_date := now() - (v_retention_days || ' days')::INTERVAL;

  -- Calculate pagination
  v_offset := (p_page - 1) * p_limit;
  IF v_offset < 0 THEN
    v_offset := 0;
  END IF;

  -- Validate and cap limit
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 50;
  END IF;
  IF p_limit > 100 THEN
    p_limit := 100;
  END IF;

  -- Build dynamic query to get total count
  IF p_filter = 'protected' THEN
    EXECUTE format(
      'SELECT count(*)::bigint FROM %I WHERE %I > %L',
      v_table_name, v_created_at_col, v_cutoff_date
    ) INTO v_total;
  ELSIF p_filter = 'expired' THEN
    EXECUTE format(
      'SELECT count(*)::bigint FROM %I WHERE %I <= %L',
      v_table_name, v_created_at_col, v_cutoff_date
    ) INTO v_total;
  ELSE
    EXECUTE format(
      'SELECT count(*)::bigint FROM %I',
      v_table_name
    ) INTO v_total;
  END IF;

  -- Calculate total pages
  v_total_pages := ceil(COALESCE(v_total, 1)::numeric / p_limit::numeric)::integer;
  IF v_total_pages < 1 THEN
    v_total_pages := 1;
  END IF;

  -- Fetch records based on filter
  IF p_filter = 'protected' THEN
    FOR v_row IN EXECUTE format(
      'SELECT id, %I FROM %I WHERE %I > %L ORDER BY %I DESC LIMIT %L OFFSET %L',
      v_created_at_col, v_table_name, v_created_at_col, v_cutoff_date, v_created_at_col, p_limit, v_offset
    ) LOOP
      v_record_id := v_row.id::text;
      v_short_id := '#' || replace(left(v_record_id, 6), '-', '');
      v_created_at := v_row.created_at;
      v_age_days := floor(extract(epoch from (now() - v_created_at)) / 86400)::integer;
      v_expires_at := v_created_at + (v_retention_days || ' days')::INTERVAL;
      
      IF v_created_at > v_cutoff_date THEN
        v_status := 'protected';
      ELSE
        v_status := 'expired';
      END IF;

      -- Get linked entity name based on category
      v_linked_entity := 'N/A';
      
      IF p_category = 'customers' THEN
        -- For customers, use client's own name
        EXECUTE format('SELECT name FROM %I WHERE id = %L', v_table_name, v_row.id)
        INTO v_client_name;
        IF v_client_name IS NOT NULL AND v_client_name != '' THEN
          v_name_parts := string_to_array(v_client_name, ' ');
          v_first_name := v_name_parts[1];
          v_last_initial := left(v_name_parts[array_upper(v_name_parts, 1)], 1);
          v_linked_entity := 'Cliente: ' || v_first_name || ' ' || v_last_initial || '.';
        END IF;
      ELSIF p_category IN ('invoices', 'quotes', 'bookings') THEN
        -- Join with clients table
        EXECUTE format(
          'SELECT c.name FROM %I r JOIN clients c ON r.client_id = c.id WHERE r.id = %L',
          v_table_name, v_row.id
        )
        INTO v_linked_name;
        IF v_linked_name IS NOT NULL AND v_linked_name != '' THEN
          v_name_parts := string_to_array(v_linked_name, ' ');
          v_first_name := v_name_parts[1];
          v_last_initial := left(v_name_parts[array_upper(v_name_parts, 1)], 1);
          v_linked_entity := 
            CASE p_category 
              WHEN 'invoices' THEN 'Factura: ' 
              WHEN 'quotes' THEN 'Presupuesto: '
              WHEN 'bookings' THEN 'Cita: '
            END || v_first_name || ' ' || v_last_initial || '.';
        END IF;
      ELSIF p_category IN ('clinical_notes', 'client_notes', 'documents', 'consents') THEN
        -- These have different link patterns - simplify to just show type
        v_linked_entity := 
          CASE p_category
            WHEN 'clinical_notes' THEN 'Nota clínica'
            WHEN 'client_notes' THEN 'Nota clínica'
            WHEN 'documents' THEN 'Documento'
            WHEN 'consents' THEN 'Consentimiento'
          END;
      END IF;

      v_records_arr := v_records_arr || jsonb_build_object(
        'id', v_short_id,
        'uuid', v_record_id,
        'created_at', v_created_at::text,
        'age_days', v_age_days,
        'expires_at', v_expires_at::text,
        'status', v_status,
        'linked_entity', v_linked_entity
      );
    END LOOP;
  ELSIF p_filter = 'expired' THEN
    FOR v_row IN EXECUTE format(
      'SELECT id, %I FROM %I WHERE %I <= %L ORDER BY %I DESC LIMIT %L OFFSET %L',
      v_created_at_col, v_table_name, v_created_at_col, v_cutoff_date, v_created_at_col, p_limit, v_offset
    ) LOOP
      v_record_id := v_row.id::text;
      v_short_id := '#' || replace(left(v_record_id, 6), '-', '');
      v_created_at := v_row.created_at;
      v_age_days := floor(extract(epoch from (now() - v_created_at)) / 86400)::integer;
      v_expires_at := v_created_at + (v_retention_days || ' days')::INTERVAL;
      
      IF v_created_at > v_cutoff_date THEN
        v_status := 'protected';
      ELSE
        v_status := 'expired';
      END IF;

      -- Get linked entity name based on category
      v_linked_entity := 'N/A';
      
      IF p_category = 'customers' THEN
        EXECUTE format('SELECT name FROM %I WHERE id = %L', v_table_name, v_row.id)
        INTO v_client_name;
        IF v_client_name IS NOT NULL AND v_client_name != '' THEN
          v_name_parts := string_to_array(v_client_name, ' ');
          v_first_name := v_name_parts[1];
          v_last_initial := left(v_name_parts[array_upper(v_name_parts, 1)], 1);
          v_linked_entity := 'Cliente: ' || v_first_name || ' ' || v_last_initial || '.';
        END IF;
      ELSIF p_category IN ('invoices', 'quotes', 'bookings') THEN
        EXECUTE format(
          'SELECT c.name FROM %I r JOIN clients c ON r.client_id = c.id WHERE r.id = %L',
          v_table_name, v_row.id
        )
        INTO v_linked_name;
        IF v_linked_name IS NOT NULL AND v_linked_name != '' THEN
          v_name_parts := string_to_array(v_linked_name, ' ');
          v_first_name := v_name_parts[1];
          v_last_initial := left(v_name_parts[array_upper(v_name_parts, 1)], 1);
          v_linked_entity := 
            CASE p_category 
              WHEN 'invoices' THEN 'Factura: ' 
              WHEN 'quotes' THEN 'Presupuesto: '
              WHEN 'bookings' THEN 'Cita: '
            END || v_first_name || ' ' || v_last_initial || '.';
        END IF;
      ELSIF p_category IN ('clinical_notes', 'client_notes', 'documents', 'consents') THEN
        v_linked_entity := 
          CASE p_category
            WHEN 'clinical_notes' THEN 'Nota clínica'
            WHEN 'client_notes' THEN 'Nota clínica'
            WHEN 'documents' THEN 'Documento'
            WHEN 'consents' THEN 'Consentimiento'
          END;
      END IF;

      v_records_arr := v_records_arr || jsonb_build_object(
        'id', v_short_id,
        'uuid', v_record_id,
        'created_at', v_created_at::text,
        'age_days', v_age_days,
        'expires_at', v_expires_at::text,
        'status', v_status,
        'linked_entity', v_linked_entity
      );
    END LOOP;
  ELSE
    -- 'all' filter
    FOR v_row IN EXECUTE format(
      'SELECT id, %I FROM %I ORDER BY %I DESC LIMIT %L OFFSET %L',
      v_created_at_col, v_table_name, v_created_at_col, p_limit, v_offset
    ) LOOP
      v_record_id := v_row.id::text;
      v_short_id := '#' || replace(left(v_record_id, 6), '-', '');
      v_created_at := v_row.created_at;
      v_age_days := floor(extract(epoch from (now() - v_created_at)) / 86400)::integer;
      v_expires_at := v_created_at + (v_retention_days || ' days')::INTERVAL;
      
      IF v_created_at > v_cutoff_date THEN
        v_status := 'protected';
      ELSE
        v_status := 'expired';
      END IF;

      -- Get linked entity name based on category
      v_linked_entity := 'N/A';
      
      IF p_category = 'customers' THEN
        EXECUTE format('SELECT name FROM %I WHERE id = %L', v_table_name, v_row.id)
        INTO v_client_name;
        IF v_client_name IS NOT NULL AND v_client_name != '' THEN
          v_name_parts := string_to_array(v_client_name, ' ');
          v_first_name := v_name_parts[1];
          v_last_initial := left(v_name_parts[array_upper(v_name_parts, 1)], 1);
          v_linked_entity := 'Cliente: ' || v_first_name || ' ' || v_last_initial || '.';
        END IF;
      ELSIF p_category IN ('invoices', 'quotes', 'bookings') THEN
        EXECUTE format(
          'SELECT c.name FROM %I r JOIN clients c ON r.client_id = c.id WHERE r.id = %L',
          v_table_name, v_row.id
        )
        INTO v_linked_name;
        IF v_linked_name IS NOT NULL AND v_linked_name != '' THEN
          v_name_parts := string_to_array(v_linked_name, ' ');
          v_first_name := v_name_parts[1];
          v_last_initial := left(v_name_parts[array_upper(v_name_parts, 1)], 1);
          v_linked_entity := 
            CASE p_category 
              WHEN 'invoices' THEN 'Factura: ' 
              WHEN 'quotes' THEN 'Presupuesto: '
              WHEN 'bookings' THEN 'Cita: '
            END || v_first_name || ' ' || v_last_initial || '.';
        END IF;
      ELSIF p_category IN ('clinical_notes', 'client_notes', 'documents', 'consents') THEN
        v_linked_entity := 
          CASE p_category
            WHEN 'clinical_notes' THEN 'Nota clínica'
            WHEN 'client_notes' THEN 'Nota clínica'
            WHEN 'documents' THEN 'Documento'
            WHEN 'consents' THEN 'Consentimiento'
          END;
      END IF;

      v_records_arr := v_records_arr || jsonb_build_object(
        'id', v_short_id,
        'uuid', v_record_id,
        'created_at', v_created_at::text,
        'age_days', v_age_days,
        'expires_at', v_expires_at::text,
        'status', v_status,
        'linked_entity', v_linked_entity
      );
    END LOOP;
  END IF;

  -- Return JSON result
  RETURN json_build_object(
    'records', v_records_arr::json,
    'pagination', json_build_object(
      'page', p_page,
      'limit', p_limit,
      'total', COALESCE(v_total, 0),
      'total_pages', v_total_pages
    )
  );
END;
$$;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION retention_records(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION retention_records(text, text, integer, integer) TO anon;
