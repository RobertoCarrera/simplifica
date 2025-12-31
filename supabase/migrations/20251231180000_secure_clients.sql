-- Secure Clients Table
-- Created on 2025-12-31-1800
-- Purpose: Prevent clients from seeing other clients' data

-- 1. Enable RLS (Idempotent)
ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to start fresh
DROP POLICY IF EXISTS "clients_select_policy" ON "public"."clients";
DROP POLICY IF EXISTS "clients_all_policy" ON "public"."clients";
DROP POLICY IF EXISTS "clients_isolation_policy" ON "public"."clients";

-- 3. Create strict isolation policy
-- Allow users to see:
-- (A) THEIR OWN record (auth.uid() matches auth_user_id)
-- (B) Records belonging to THEIR COMPANY (if they are staff - i.e. present in users table)
CREATE POLICY "clients_isolation_policy" ON "public"."clients"
FOR SELECT
USING (
    -- Case A: Browser IS the client
    auth.uid() = auth_user_id
    OR
    -- Case B: Browser IS staff/admin
    -- Logic: The current auth.uid() must exist in 'public.users' AND belong to the same company_id as the client record
    EXISTS (
        SELECT 1 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid() 
        AND u.company_id = clients.company_id
        AND u.active = true
    )
    OR
    -- Case C: Global Admin/Owner override (optional, but good for support)
    EXISTS (
        SELECT 1 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid() 
        AND u.role = 'owner' -- or 'admin' depending on definitions
    )
);

-- Note: We only restrict SELECT. Insert/Update/Delete usually handled by API logic or stricter policies if needed.
-- For now, we assume clients don't insert/delete themselves via pure SQL in the frontend.

-- Grant access
GRANT SELECT ON "public"."clients" TO "authenticated";
