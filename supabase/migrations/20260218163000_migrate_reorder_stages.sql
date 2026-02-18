-- Migration: Migrate 'reorder-stages' Edge Function to RPC
-- Priority: High (Optimization)

CREATE OR REPLACE FUNCTION reorder_stages(stage_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- 1. Get company_id
  SELECT company_id INTO v_company_id 
  FROM public.users 
  WHERE auth_user_id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to a company';
  END IF;

  -- 2. Validate all stages are generic (company_id IS NULL)
  -- The Edge Function checked this, so we should too to maintain behavior.
  IF EXISTS (
    SELECT 1 
    FROM ticket_stages 
    WHERE id = ANY(stage_ids) 
      AND company_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Only generic stages can be reordered via this endpoint';
  END IF;

  -- 3. Upsert positions
  -- We use unnest with ordinality to get the index. 
  -- JS sends array, index 0..N. unnest returns 1..N. So we subtract 1.
  INSERT INTO company_stage_order (company_id, stage_id, position)
  SELECT 
    v_company_id, 
    elem_id, 
    (idx - 1)
  FROM unnest(stage_ids) WITH ORDINALITY AS t(elem_id, idx)
  ON CONFLICT (company_id, stage_id) 
  DO UPDATE SET position = EXCLUDED.position;

END;
$$;

GRANT EXECUTE ON FUNCTION reorder_stages(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_stages(uuid[]) TO service_role;
