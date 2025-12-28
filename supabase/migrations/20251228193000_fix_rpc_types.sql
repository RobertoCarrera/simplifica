-- Fix RPC: get_config_stages (Type mismatch fix)
-- Returns generic stages annotated with is_hidden and custom position
-- Explicitly casts columns to text to match RETURNS TABLE definition

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
  -- Get current user's company_id from auth.uid() (assuming users table has company_id)
  -- Or strictly rely on the caller passing it? No, we want to resolve it securely.
  -- Existing logic in Edge Function resolved it.
  -- For now, let's assume we can get it from a profiles/users table or rely on RLS context if set.
  -- But here we are in an RPC. 
  
  -- Logic adapted from finding company_id:
  SELECT company_id INTO v_company_id
  FROM users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- Fallback to clients table if not in users
  IF v_company_id IS NULL THEN
    SELECT company_id INTO v_company_id
    FROM clients
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name::text,
    COALESCE(o.position, s.position) as position, -- Override position if exists in overlay
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
