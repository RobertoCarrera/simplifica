-- Allow portal clients (auth users in client_portal_users) to read and
-- create projects for their company, and read/update their own client_id.
--
-- The existing policy "Enable access for company members" on public.projects
-- only allows access to users in public.company_members. Portal clients live
-- in public.client_portal_users (different table) and were blocked from any
-- project access.
--
-- Strategy: ADD a permissive policy that opens the table to portal users
-- scoped by their client_portal_users rows. The original "company members"
-- policy stays so the CRM staff team is not affected. PostgreSQL ORs
-- permissive policies for the same role.
--
-- Notes:
--   * portal clients can SELECT projects where client_id matches the
--     client_id in their client_portal_users row for that company.
--   * portal clients can INSERT projects with their own client_id and
--     company_id. We do not let them pick arbitrary client_id (server
--     force-injects it from their active client_portal_users row).
--   * portal clients can UPDATE only their own projects (client_id = own).
--   * portal clients can DELETE only their own projects.

-- SELECT: open read for portal clients
CREATE POLICY "Portal clients can read own projects"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
        AND client_id IS NOT NULL
    )
  );

-- INSERT: portal clients create projects owned by themselves
CREATE POLICY "Portal clients can create own projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- the client_id on the new row must match the client's active membership
    client_id IN (
      SELECT client_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
        AND client_id IS NOT NULL
    )
    AND company_id IN (
      SELECT company_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
    )
  );

-- UPDATE: portal clients edit only their own
CREATE POLICY "Portal clients can update own projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
        AND client_id IS NOT NULL
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
        AND client_id IS NOT NULL
    )
  );

-- DELETE: portal clients delete only their own
CREATE POLICY "Portal clients can delete own projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
        AND client_id IS NOT NULL
    )
  );

-- project_stages: portal clients can read stages of their active company
-- (no write access — stages are managed by the CRM team)
CREATE POLICY "Portal clients can read stages of their company"
  ON public.project_stages
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.client_portal_users
      WHERE auth_user_id = auth.uid()
        AND is_active = true
    )
  );

-- project_tasks: portal clients can read/insert/update/delete tasks of
-- projects they own (via client_id chain)
CREATE POLICY "Portal clients can read own project tasks"
  ON public.project_tasks
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

CREATE POLICY "Portal clients can manage own project tasks"
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
