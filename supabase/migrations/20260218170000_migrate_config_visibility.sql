-- Migration: Migrate Stage/Unit Configuration Edge Functions to RPCs
-- Replaces: hide-stage, get-config-stages, hide-unit, get-config-units
-- Priority: High (Core Configuration)

--------------------------------------------------------------------------------
-- 1. Helper Function: Check Visible Stages Coverage
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_stage_coverage_after_hide(
  p_company_id uuid,
  p_stage_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_category text;
  v_visible_count int;
BEGIN
  -- Get category of the stage being hidden
  SELECT workflow_category INTO v_category
  FROM ticket_stages
  WHERE id = p_stage_id;

  IF v_category IS NULL THEN
    RETURN TRUE; -- Should not happen if stage exists
  END IF;

  -- Count visible stages in this category for this company, EXCLUDING the one being hidden
  -- Visible = (Generic AND NOT Hidden) OR (Company Specific)
  SELECT COUNT(*)
  INTO v_visible_count
  FROM ticket_stages ts
  WHERE ts.workflow_category = v_category
    AND ts.deleted_at IS NULL
    AND (
      -- Company specific stage
      ts.company_id = p_company_id
      OR
      -- Generic stage not hidden (and not the one we are hiding)
      (ts.company_id IS NULL 
       AND ts.id != p_stage_id
       AND NOT EXISTS (
         SELECT 1 FROM hidden_stages hs 
         WHERE hs.company_id = p_company_id 
           AND hs.stage_id = ts.id
       )
      )
    );

  RETURN v_visible_count > 0;
END;
$$;

--------------------------------------------------------------------------------
-- 2. RPC: toggle_stage_visibility (Replaces hide-stage)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toggle_stage_visibility(
  p_stage_id uuid,
  p_operation text, -- 'hide' or 'unhide'
  p_reassign_to uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_is_generic boolean;
  v_count_tickets int;
  v_target_category text;
  v_source_category text;
  v_target_visible boolean;
BEGIN
  -- 1. Resolve User and Company
  SELECT company_id, id INTO v_company_id, v_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  IF v_company_id IS NULL THEN
     -- Fallback to clients table
     SELECT company_id, id INTO v_company_id, v_user_id
     FROM public.clients
     WHERE auth_user_id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with a company';
  END IF;

  -- 2. Validate Stage is Generic
  SELECT (company_id IS NULL), workflow_category INTO v_is_generic, v_source_category
  FROM ticket_stages
  WHERE id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found';
  END IF;

  IF NOT v_is_generic THEN
    RAISE EXCEPTION 'Only generic stages can be modified via this endpoint';
  END IF;

  -- 3. Execute Operation
  IF p_operation = 'hide' THEN
    
    -- 3a. Check Coverage
    IF NOT check_stage_coverage_after_hide(v_company_id, p_stage_id) THEN
      RAISE EXCEPTION 'Hiding this stage would leave its workflow category without any visible stage';
    END IF;

    -- 3b. Check Tickets Usage
    SELECT COUNT(*) INTO v_count_tickets
    FROM tickets
    WHERE company_id = v_company_id AND stage_id = p_stage_id;

    IF v_count_tickets > 0 THEN
      IF p_reassign_to IS NULL THEN
         RAISE EXCEPTION 'Tickets reference this stage; reassignment required (% tickets)', v_count_tickets;
      END IF;

      -- Validate Reassign Target
      SELECT workflow_category INTO v_target_category
      FROM ticket_stages
      WHERE id = p_reassign_to;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Reassignment target not found';
      END IF;

      IF v_source_category != v_target_category THEN
        RAISE EXCEPTION 'Target stage must be in the same workflow category';
      END IF;

      -- Check if target is visible
      SELECT EXISTS (
        SELECT 1 FROM ticket_stages ts
        WHERE ts.id = p_reassign_to
          AND (
            ts.company_id = v_company_id
            OR (ts.company_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM hidden_stages hs WHERE hs.company_id = v_company_id AND hs.stage_id = p_reassign_to
            ))
          )
      ) INTO v_target_visible;

      IF NOT v_target_visible THEN
        RAISE EXCEPTION 'Target stage is not visible for this company';
      END IF;

      -- Reassign Tickets
      UPDATE tickets
      SET stage_id = p_reassign_to
      WHERE company_id = v_company_id AND stage_id = p_stage_id;
    END IF;

    -- 3c. Perform Hide
    INSERT INTO hidden_stages (company_id, stage_id, hidden_by)
    VALUES (v_company_id, p_stage_id, v_user_id)
    ON CONFLICT (company_id, stage_id) DO NOTHING;
    
    RETURN json_build_object('result', 'hidden');

  ELSIF p_operation = 'unhide' THEN
    DELETE FROM hidden_stages
    WHERE company_id = v_company_id AND stage_id = p_stage_id;
    
    RETURN json_build_object('result', 'unhidden');

  ELSE
    RAISE EXCEPTION 'Invalid operation: %', p_operation;
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 3. RPC: get_company_config_stages (Replaces get-config-stages)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_company_config_stages(p_expected_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  "position" int,
  color text,
  company_id uuid,
  stage_category text,
  workflow_category text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  is_hidden boolean,
  effective_position int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Resolve Company
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  IF v_company_id IS NULL THEN
     SELECT company_id INTO v_company_id FROM public.clients WHERE auth_user_id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with a company';
  END IF;

  -- Optional check if specific company requested matches user's company
  -- Just ignore p_expected_company_id if it matches, raise specific error if mismatch to mimic edge function behavior
  IF p_expected_company_id IS NOT NULL AND p_expected_company_id != v_company_id THEN
    RAISE EXCEPTION 'Forbidden company_id';
  END IF;

  RETURN QUERY
  SELECT 
    ts.id,
    ts.name,
    ts.position,
    ts.color,
    ts.company_id,
    ts.stage_category,
    ts.workflow_category,
    ts.created_at,
    ts.updated_at,
    ts.deleted_at,
    (hs.stage_id IS NOT NULL) as is_hidden,
    COALESCE(cso.position, ts.position) as effective_position
  FROM ticket_stages ts
  LEFT JOIN hidden_stages hs ON hs.stage_id = ts.id AND hs.company_id = v_company_id
  LEFT JOIN company_stage_order cso ON cso.stage_id = ts.id AND cso.company_id = v_company_id
  WHERE ts.company_id IS NULL AND ts.deleted_at IS NULL
  ORDER BY effective_position ASC;
END;
$$;

--------------------------------------------------------------------------------
-- 4. RPC: toggle_unit_visibility (Replaces hide-unit)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toggle_unit_visibility(
  p_unit_id uuid,
  p_operation text -- 'hide' or 'unhide'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_is_generic boolean;
BEGIN
  -- Resolve User
  SELECT company_id, id INTO v_company_id, v_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  IF v_company_id IS NULL THEN
     SELECT company_id, id INTO v_company_id, v_user_id
     FROM public.clients
     WHERE auth_user_id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with a company';
  END IF;

  -- Validate Unit
  SELECT (company_id IS NULL) INTO v_is_generic
  FROM service_units
  WHERE id = p_unit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  IF NOT v_is_generic THEN
    RAISE EXCEPTION 'Only generic units can be hidden';
  END IF;

  -- Execute
  IF p_operation = 'hide' THEN
    -- Check if hidden_units table exists (Implicit, but if it fails, PLPGSQL will raise error)
    INSERT INTO hidden_units (company_id, unit_id, hidden_by)
    VALUES (v_company_id, p_unit_id, v_user_id)
    ON CONFLICT (company_id, unit_id) DO NOTHING;
    RETURN json_build_object('result', 'hidden');

  ELSIF p_operation = 'unhide' THEN
    DELETE FROM hidden_units
    WHERE company_id = v_company_id AND unit_id = p_unit_id;
    RETURN json_build_object('result', 'unhidden');

  ELSE
    RAISE EXCEPTION 'Invalid operation';
  END IF;
END;
$$;


--------------------------------------------------------------------------------
-- 5. RPC: get_company_config_units (Replaces get-config-units)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_company_config_units(p_expected_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  company_id uuid,
  created_at timestamptz,
  is_hidden boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Resolve Company
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  IF v_company_id IS NULL THEN
     SELECT company_id INTO v_company_id FROM public.clients WHERE auth_user_id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with a company';
  END IF;

  IF p_expected_company_id IS NOT NULL AND p_expected_company_id != v_company_id THEN
    RAISE EXCEPTION 'Forbidden company_id';
  END IF;

  RETURN QUERY
  SELECT 
    su.id,
    su.name,
    su.company_id,
    su.created_at,
    (hu.unit_id IS NOT NULL) as is_hidden
  FROM service_units su
  LEFT JOIN hidden_units hu ON hu.unit_id = su.id AND hu.company_id = v_company_id
  WHERE su.company_id IS NULL
  ORDER BY su.name ASC;
END;
$$;

-- Helpers for permissions
GRANT EXECUTE ON FUNCTION check_stage_coverage_after_hide(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_stage_visibility(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_config_stages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_unit_visibility(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_config_units(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION check_stage_coverage_after_hide(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION toggle_stage_visibility(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_company_config_stages(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION toggle_unit_visibility(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_company_config_units(uuid) TO service_role;
