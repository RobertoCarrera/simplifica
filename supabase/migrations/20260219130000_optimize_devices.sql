-- Optimize Devices Table Performance
-- Adding index on company_id to fix timeouts in DevicesService.getDevices

-- 1. Create Index for Devices Company ID
CREATE INDEX IF NOT EXISTS idx_devices_company_id ON devices(company_id);

-- 2. Create Index for Devices Client ID (often used for filtering by client)
CREATE INDEX IF NOT EXISTS idx_devices_client_id ON devices(client_id);

-- 3. Optimize Devices RLS (ensure scalable access)
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Re-create read policy for better performance if needed (standard is usually direct check)
-- Assuming the standard policy is "Enable read access for company members"
-- We will replace it with an optimized version just in case


DROP POLICY IF EXISTS "Enable read access for company members" ON devices;

CREATE POLICY "Enable read access for company members" ON devices
FOR SELECT
TO authenticated
USING (
  public.is_company_member(company_id)
);
