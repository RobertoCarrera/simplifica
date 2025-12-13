-- Add 'request' status to quote_status enum
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'request';

-- Add public visibility and features to services
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS features TEXT;

-- Add automation settings to company_settings
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS allow_direct_contracting BOOLEAN DEFAULT false;
-- auto_send_quote_email might already exist, but let's ensure it does
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_send_quote_email BOOLEAN DEFAULT false;

-- Create a secure view for public services (so clients can see them without full access to services table)
-- Or just update RLS on services table.
-- Let's update RLS.
-- Allow public read access to services where is_public = true
-- Allow authenticated users (clients) to view public services
-- We use DO block to avoid error if policy already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'services'
        AND policyname = 'Clients can view public services'
    ) THEN
        CREATE POLICY "Clients can view public services" 
        ON services FOR SELECT 
        TO authenticated 
        USING (is_public = true);
    END IF;
END
$$;

-- Create a view for easier access if needed
CREATE OR REPLACE VIEW client_visible_services AS
SELECT 
  s.*
FROM services s
WHERE 
  s.is_public = true;

GRANT SELECT ON client_visible_services TO authenticated;
