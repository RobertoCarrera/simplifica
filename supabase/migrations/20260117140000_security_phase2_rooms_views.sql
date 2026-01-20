-- [SECURITY PHASE 2]
-- 1. Fix ROOMS Table RLS (Critical Tenant Isolation)
-- Drop permissive policies identified by advisor
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.rooms;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.rooms;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.rooms;

-- Enable RLS logic
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Add restrictive policies
CREATE POLICY "Users can view own company rooms" ON public.rooms
FOR SELECT TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage own company rooms" ON public.rooms
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = rooms.company_id
    AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- 2. Fix SECURITY DEFINER Views (Convert to Security Invoker)
-- This ensures the view runs with the permissions of the USER, not the CREATOR (postgres)

-- admin_company_analysis
CREATE OR REPLACE VIEW public.admin_company_analysis
WITH (security_invoker = true)
AS
SELECT c.id,
    c.name,
    c.slug,
    c.created_at,
    count(u.id) AS total_users,
    count(u.id) FILTER (WHERE ar.name = 'owner') AS owners_count,
    count(u.id) FILTER (WHERE ar.name = 'admin') AS admins_count,
    count(u.id) FILTER (WHERE ar.name = 'member') AS members_count,
    count(ci.id) FILTER (WHERE ci.status = 'pending') AS pending_invitations,
    string_agg(u.email, ', ') FILTER (WHERE ar.name = 'owner') AS owner_emails
   FROM companies c
     LEFT JOIN users u ON c.id = u.company_id AND u.active = true
     LEFT JOIN app_roles ar ON u.app_role_id = ar.id
     LEFT JOIN company_invitations ci ON c.id = ci.company_id AND ci.status = 'pending'
  WHERE c.deleted_at IS NULL
  GROUP BY c.id, c.name, c.slug, c.created_at
  ORDER BY c.created_at DESC;

-- profiles
CREATE OR REPLACE VIEW public.profiles
WITH (security_invoker = true)
AS
SELECT u.auth_user_id AS user_id,
    u.company_id,
    ar.name AS role,
    u.last_session_at
   FROM users u
     LEFT JOIN app_roles ar ON u.app_role_id = ar.id
  WHERE u.deleted_at IS NULL;

-- visible_stages_by_company
CREATE OR REPLACE VIEW public.visible_stages_by_company
WITH (security_invoker = true)
AS
SELECT ts.id,
    ts.name,
    ts."position",
    ts.color,
    ts.created_at,
    ts.updated_at,
    ts.deleted_at,
    ts.company_id,
    c.id AS viewing_company_id,
        CASE
            WHEN (ts.company_id IS NULL) THEN 'generic'::text
            WHEN (ts.company_id = c.id) THEN 'company'::text
            ELSE 'other'::text
        END AS stage_type,
        CASE
            WHEN (hs.id IS NOT NULL) THEN true
            ELSE false
        END AS is_hidden
   FROM ticket_stages ts
     CROSS JOIN companies c
     LEFT JOIN hidden_stages hs ON hs.stage_id = ts.id AND hs.company_id = c.id AND ts.company_id IS NULL
  WHERE (ts.company_id IS NULL AND hs.id IS NULL) OR (ts.company_id = c.id);
