-- Fix RPC: get_config_stages (Ambiguous column fix)
-- Fixes 'column reference "company_id" is ambiguous' by qualifying columns
-- when conflicting with RETURNS TABLE parameters.

CREATE OR REPLACE FUNCTION get_config_stages()
RETURNS TABLE (
  "id" uuid,
  "name" text,
  "position" integer,
  "color" text,
  "company_id" uuid,
  "stage_category" text,
  "workflow_category" text,
  "created_at" timestamptz,
  "updated_at" timestamptz,
  "is_hidden" boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Resolve company_id using table aliases to avoid conflict with output parameter 'company_id'
  
  -- Try users table
  SELECT u.company_id INTO v_company_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  -- Fallback to clients table
  IF v_company_id IS NULL THEN
    SELECT c.company_id INTO v_company_id
    FROM clients c
    WHERE c.auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name::text,
    COALESCE(o.position, s.position) as position,
    s.color::text,
    s.company_id,
    s.stage_category::text,
    s.workflow_category::text,
    s.created_at,
    s.updated_at,
    (h.id IS NOT NULL) as is_hidden
  FROM ticket_stages s
  LEFT JOIN hidden_stages h ON s.id = h.stage_id AND h.company_id = v_company_id
  LEFT JOIN company_stage_order o ON s.id = o.stage_id AND o.company_id = v_company_id
  WHERE s.company_id IS NULL -- Only generic stages
  ORDER BY 
    COALESCE(o.position, s.position) ASC;
END;
$$;
