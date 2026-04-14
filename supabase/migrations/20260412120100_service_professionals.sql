-- Add is_primary column to professional_services junction table
-- This allows marking one professional as the primary provider for a service

ALTER TABLE professional_services
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Ensure RLS is enabled (idempotent)
ALTER TABLE professional_services ENABLE ROW LEVEL SECURITY;

-- RLS: Company members can access professional_services for their company's services
-- Pattern matches project_stages, projects, project_tasks from 20260208123000_kanban_board.sql
CREATE POLICY "Enable access for company members"
  ON public.professional_services
  FOR ALL
  USING (
    service_id IN (
      SELECT id FROM public.services
      WHERE company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  );

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_professional_services_service_id
  ON professional_services(service_id);
CREATE INDEX IF NOT EXISTS idx_professional_services_professional_id
  ON professional_services(professional_id);

-- Ensure only one primary professional per service
CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_services_one_primary
  ON professional_services(service_id)
  WHERE is_primary = true;
