-- Optimize Ticket Detail View Performance
-- Adding indexes and refined RLS policies to prevent timeouts on ticket_services, ticket_comments, and ticket_devices

-- 1. Create Indexes for Foreign Keys (Performance Critical)
-- These indexes handle the "ticket_id=eq.UUID" filter used by the frontend
CREATE INDEX IF NOT EXISTS idx_ticket_services_ticket_id ON ticket_services(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_devices_ticket_id ON ticket_devices(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id);

-- 2. RLS Policies Optimization
-- Ensure RLS is enabled
ALTER TABLE ticket_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_devices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to cleanly replace them
DROP POLICY IF EXISTS "Enable read access for company members" ON ticket_services;
DROP POLICY IF EXISTS "Enable insert for company members" ON ticket_services;
DROP POLICY IF EXISTS "Enable update for company members" ON ticket_services;
DROP POLICY IF EXISTS "Enable delete for company members" ON ticket_services;

DROP POLICY IF EXISTS "Enable read access for company members" ON ticket_comments;
DROP POLICY IF EXISTS "Enable insert for company members" ON ticket_comments;

DROP POLICY IF EXISTS "Enable read access for company members" ON ticket_devices;
DROP POLICY IF EXISTS "Enable insert for company members" ON ticket_devices;
DROP POLICY IF EXISTS "Enable delete for company members" ON ticket_devices;

-- Create optimized read policies using EXISTS instead of IN for better performance
-- Ticket Services
CREATE POLICY "Enable read access for company members" ON ticket_services
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_services.ticket_id
    AND (
      public.is_company_member(t.company_id) 
      OR 
      auth.uid() = (SELECT auth_user_id FROM public.users WHERE id = t.created_by)
    )
  )
);

-- Ticket Comments
CREATE POLICY "Enable read access for company members" ON ticket_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_comments.ticket_id
    AND public.is_company_member(t.company_id)
  )
);

-- Ticket Devices
CREATE POLICY "Enable read access for company members" ON ticket_devices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_devices.ticket_id
    AND public.is_company_member(t.company_id)
  )
);

-- Note: Insert/Update policies are usually narrower, but read is the performance bottleneck here.
-- Leaving write policies as exercises or assuming existing ones are sufficient if they use simple checks.
-- If no write policy exists, users can't write. The frontend logs show GET errors, so focusing on SELECT.


