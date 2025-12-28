-- Ensure tables exist (idempotent)
CREATE TABLE IF NOT EXISTS "public"."hidden_stages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
    "stage_id" uuid NOT NULL REFERENCES "public"."ticket_stages"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE("company_id", "stage_id")
);

-- RLS for hidden_stages
ALTER TABLE "public"."hidden_stages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view hidden_stages of their company" ON "public"."hidden_stages"
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert hidden_stages for their company" ON "public"."hidden_stages"
    FOR INSERT WITH CHECK (
        company_id IN (
            SELECT company_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete hidden_stages of their company" ON "public"."hidden_stages"
    FOR DELETE USING (
        company_id IN (
            SELECT company_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- Table for custom ordering per company
CREATE TABLE IF NOT EXISTS "public"."company_stage_order" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
    "stage_id" uuid NOT NULL REFERENCES "public"."ticket_stages"("id") ON DELETE CASCADE,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE("company_id", "stage_id")
);

-- RLS for company_stage_order
ALTER TABLE "public"."company_stage_order" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stage order of their company" ON "public"."company_stage_order"
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage stage order for their company" ON "public"."company_stage_order"
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM users WHERE auth_user_id = auth.uid()
        )
    );


-- RPC: get_config_stages
-- Returns generic stages annotated with is_hidden and custom position
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
  -- Get company_id of the executing user
  SELECT u.company_id INTO v_company_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to a company';
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
  LEFT JOIN hidden_stages h ON h.stage_id = s.id AND h.company_id = v_company_id
  LEFT JOIN company_stage_order o ON o.stage_id = s.id AND o.company_id = v_company_id
  WHERE s.company_id IS NULL -- Only generic stages
  AND s.deleted_at IS NULL
  ORDER BY 3 ASC; -- Order by 3rd column (calculated position)
END;
$$;


-- RPC: toggle_stage_visibility
CREATE OR REPLACE FUNCTION toggle_stage_visibility(p_stage_id uuid, p_hide boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_is_generic boolean;
BEGIN
  -- Get company_id
  SELECT u.company_id INTO v_company_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to a company';
  END IF;

  -- Check if stage is generic
  SELECT (company_id IS NULL) INTO v_is_generic
  FROM ticket_stages
  WHERE id = p_stage_id;

  IF NOT v_is_generic THEN
    RAISE EXCEPTION 'Cannot toggle visibility of non-generic stage via this RPC';
  END IF;

  IF p_hide THEN
    -- Insert into hidden_stages
    INSERT INTO hidden_stages (company_id, stage_id)
    VALUES (v_company_id, p_stage_id)
    ON CONFLICT (company_id, stage_id) DO NOTHING;
  ELSE
    -- Remove from hidden_stages
    DELETE FROM hidden_stages
    WHERE company_id = v_company_id AND stage_id = p_stage_id;
  END IF;
END;
$$;

-- RPC: update_stage_order
-- Updates the position overlay for a stage
CREATE OR REPLACE FUNCTION update_stage_order(p_stage_id uuid, p_new_position integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
BEGIN
   -- Get company_id
  SELECT u.company_id INTO v_company_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to a company';
  END IF;

  INSERT INTO company_stage_order (company_id, stage_id, position)
  VALUES (v_company_id, p_stage_id, p_new_position)
  ON CONFLICT (company_id, stage_id) 
  DO UPDATE SET position = EXCLUDED.position, created_at = now();
END;
$$;
