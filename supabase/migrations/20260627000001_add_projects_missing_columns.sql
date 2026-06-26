-- v4.11: add missing columns to public.projects that the service layer
-- (projects.service.ts getProjects) and the projects policy expect.
--
-- The getProjects() query in projects.service.ts (line 247) selects:
--   id, name, description, status, priority, position,
--   company_id, client_id, stage_id, assigned_to,
--   start_date, end_date, is_archived, is_internal_archived,
--   created_at, updated_at, created_by, client:client_id(...), tasks:project_tasks(...)
--
-- The original CREATE TABLE (20260208123000_kanban_board.sql) only has:
--   id, company_id, client_id, stage_id, name, description,
--   start_date, end_date, priority, position, created_at, updated_at
--
-- Adding the 4 missing columns:
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'completed', 'on_hold')),
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_internal_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Indexes for the service layer filters
CREATE INDEX IF NOT EXISTS idx_projects_company_archived
  ON public.projects (company_id, is_archived);
