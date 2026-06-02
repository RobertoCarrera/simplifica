-- service_blocked_dates: block date ranges at the service level
-- When a service is blocked, ALL professionals who perform that service are blocked
-- during the specified period, preventing new bookings.

CREATE TABLE IF NOT EXISTS service_blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time DEFAULT NULL,
  end_time time DEFAULT NULL,
  reason text DEFAULT NULL,
  all_day boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_service_blocked_dates_range CHECK (end_date >= start_date)
);

COMMENT ON TABLE service_blocked_dates IS
  'Blocks date ranges for a service. All professionals assigned to the service are blocked during the period.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_blocked_dates_service_id ON service_blocked_dates(service_id);
CREATE INDEX IF NOT EXISTS idx_service_blocked_dates_company_id ON service_blocked_dates(company_id);
CREATE INDEX IF NOT EXISTS idx_service_blocked_dates_dates ON service_blocked_dates(start_date, end_date);

-- Enable RLS
ALTER TABLE service_blocked_dates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- SELECT: any authenticated member of the company can view
DROP POLICY IF EXISTS "service_blocked_dates_select" ON service_blocked_dates;
CREATE POLICY "service_blocked_dates_select" ON service_blocked_dates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = service_blocked_dates.company_id
        AND cm.status = 'active'
    )
  );

-- INSERT: owner / super_admin can create
DROP POLICY IF EXISTS "service_blocked_dates_insert" ON service_blocked_dates;
CREATE POLICY "service_blocked_dates_insert" ON service_blocked_dates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = service_blocked_dates.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'super_admin')
    )
  );

-- UPDATE: owner / super_admin can update
DROP POLICY IF EXISTS "service_blocked_dates_update" ON service_blocked_dates;
CREATE POLICY "service_blocked_dates_update" ON service_blocked_dates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = service_blocked_dates.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'super_admin')
    )
  );

-- DELETE: owner / super_admin can delete
DROP POLICY IF EXISTS "service_blocked_dates_delete" ON service_blocked_dates;
CREATE POLICY "service_blocked_dates_delete" ON service_blocked_dates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = service_blocked_dates.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'super_admin')
    )
  );
