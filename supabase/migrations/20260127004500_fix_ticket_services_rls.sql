-- Fix RLS policies for ticket_services and ticket_devices to support multi-company access
-- Previous policies relied on get_user_company_id() which only returns the primary company

-- 1. Ticket Services
DROP POLICY IF EXISTS "ticket_services_company_only" ON "public"."ticket_services";

CREATE POLICY "ticket_services_company_access" ON "public"."ticket_services"
AS PERMISSIVE FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    JOIN company_members cm ON t.company_id = cm.company_id
    JOIN users u ON cm.user_id = u.id
    WHERE t.id = ticket_services.ticket_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tickets t
    JOIN company_members cm ON t.company_id = cm.company_id
    JOIN users u ON cm.user_id = u.id
    WHERE t.id = ticket_services.ticket_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  )
);

-- 2. Ticket Devices
DROP POLICY IF EXISTS "ticket_devices_via_ticket" ON "public"."ticket_devices";
DROP POLICY IF EXISTS "Users can insert ticket devices from their company" ON "public"."ticket_devices";
DROP POLICY IF EXISTS "Users can manage ticket devices from their company" ON "public"."ticket_devices";

CREATE POLICY "ticket_devices_company_access" ON "public"."ticket_devices"
AS PERMISSIVE FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    JOIN company_members cm ON t.company_id = cm.company_id
    JOIN users u ON cm.user_id = u.id
    WHERE t.id = ticket_devices.ticket_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tickets t
    JOIN company_members cm ON t.company_id = cm.company_id
    JOIN users u ON cm.user_id = u.id
    WHERE t.id = ticket_devices.ticket_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  )
);
