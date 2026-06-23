-- Add portal-client access to all project_* related tables.
--
-- Strategy: same as the previous projects migration — we add permissive
-- RLS policies that open the table to portal users (auth users in
-- client_portal_users) and scope by their client_id and company_id.
-- The CRM "company members" policies are left untouched so the staff
-- team continues to work.
--
-- The portal BFF enforces the same client_id / company_id filter in
-- code before writing; this RLS layer is the second line of defense.

-- project_tasks: read/insert/update/delete only for the client's own
CREATE POLICY "Portal clients can manage own project tasks v2"
  ON public.project_tasks
  FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE client_id IN (
        SELECT client_id FROM public.client_portal_users
        WHERE auth_user_id = auth.uid()
          AND is_active = true
          AND client_id IS NOT NULL
      )
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE client_id IN (
        SELECT client_id FROM public.client_portal_users
        WHERE auth_user_id = auth.uid()
          AND is_active = true
          AND client_id IS NOT NULL
      )
    )
  );

-- project_comments: read/insert for the client's own projects
-- (delete is staff-only)
CREATE POLICY "Portal clients can read own project comments"
  ON public.project_comments
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE client_id IN (
        SELECT client_id FROM public.client_portal_users
        WHERE auth_user_id = auth.uid()
          AND is_active = true
          AND client_id IS NOT NULL
      )
    )
  );

CREATE POLICY "Portal clients can comment on own projects"
  ON public.project_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE client_id IN (
        SELECT client_id FROM public.client_portal_users
        WHERE auth_user_id = auth.uid()
          AND is_active = true
          AND client_id IS NOT NULL
      )
    )
    -- A comment can be authored by a staff user (user_id) or by the
    -- client themselves (client_id). We allow either as long as the
    -- comment belongs to one of the client's projects.
  );

-- project_files: read-only for the client (upload is staff-only in
-- the CRM; the portal does not expose file management for now).
CREATE POLICY "Portal clients can read own project files"
  ON public.project_files
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE client_id IN (
        SELECT client_id FROM public.client_portal_users
        WHERE auth_user_id = auth.uid()
          AND is_active = true
          AND client_id IS NOT NULL
      )
    )
  );

-- project_stages: read-only for the client (no client writes to stages
-- in the current permission model — they cannot move stage either).
-- The earlier migration already opened SELECT to portal clients; this
-- is a no-op for SELECT but we leave it in case other migrations
-- tightened things up.
-- (intentionally no INSERT/UPDATE/DELETE for portal clients)

-- project_permission_templates: read-only for the client. The portal
-- shows a "what can I do here" hint based on these flags, but the
-- client cannot change them.
CREATE POLICY "Portal clients can read own company permission template"
  ON public.project_permission_templates
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
    )
  );
