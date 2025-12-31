-- Fix RPCs, Foreign Keys and RLS Policies
-- Created on 2025-12-31

-- 1. Redefine get_config_stages to ensure it exists (Fixes SQLSTATE 42883)
CREATE OR REPLACE FUNCTION "public"."get_config_stages"() RETURNS TABLE("id" "uuid", "name" "text", "position" integer, "color" "text", "company_id" "uuid", "stage_category" "public"."stage_category", "workflow_category" "public"."workflow_category", "is_hidden" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_company_id uuid := public.get_user_company_id();
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name::text,
    s.position,
    s.color::text,
    s.company_id,
    s.stage_category,
    s.workflow_category,
    (hs.id IS NOT NULL) as is_hidden
  FROM public.ticket_stages s
  LEFT JOIN public.hidden_stages hs ON s.id = hs.stage_id AND hs.company_id = v_company_id
  WHERE s.company_id = v_company_id OR s.company_id IS NULL -- System stages + Company stages
  ORDER BY s.position;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."get_config_stages"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_config_stages"() TO "service_role"; -- Just in case

-- 2. Fix services_tags Foreign Keys (Fixes PGRST200)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'services_tags_service_id_fkey'
    ) THEN
        ALTER TABLE "public"."services_tags"
        ADD CONSTRAINT "services_tags_service_id_fkey"
        FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'services_tags_tag_id_fkey'
    ) THEN
        ALTER TABLE "public"."services_tags"
        ADD CONSTRAINT "services_tags_tag_id_fkey"
        FOREIGN KEY ("tag_id") REFERENCES "public"."global_tags"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Fix Clients RLS (Fixes User seeing all clients)
ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;

-- Remove existing permissive policies if any (safeguard)
DROP POLICY IF EXISTS "clients_select_policy" ON "public"."clients";
DROP POLICY IF EXISTS "clients_all_policy" ON "public"."clients";

-- Add strict policy: Clients can only see themselves, Staff can see their company's clients
CREATE POLICY "clients_isolation_policy" ON "public"."clients"
FOR SELECT
USING (
    -- Case 1: Browser is a Client (auth.uid matches their record)
    auth.uid() = auth_user_id
    OR
    -- Case 2: Browser is Staff/Admin (check company_id match)
    company_id = (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid())
);

-- 4. Stub get_top_tags to prevent 404/500 if missing
CREATE OR REPLACE FUNCTION "public"."get_top_tags"(limit_count int, search_scope text) 
RETURNS TABLE("id" uuid, "name" text, "usage_count" bigint)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
    -- Simple implementation returning most used tags
    RETURN QUERY
    SELECT 
        t.id, 
        t.name::text, 
        COUNT(st.service_id)::bigint as usage_count
    FROM public.global_tags t
    LEFT JOIN public.services_tags st ON t.id = st.tag_id
    GROUP BY t.id, t.name
    ORDER BY usage_count DESC
    LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."get_top_tags"(int, text) TO "authenticated";
