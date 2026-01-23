-- Test Payment Integrations RLS
-- Run this in Supabase SQL Editor to verify logic

-- Setup: Helper to impersonate user (if needed in local dev)
-- SET LOCAL ROLE authenticated;
-- SET LOCAL "request.jwt.claim.sub" = 'user_uuid';

-- 1. Verify Policy Existence
SELECT * FROM pg_policies WHERE tablename = 'payment_integrations';

-- 2. Test Query (as Owner)
-- Should return rows for their company
-- SELECT * FROM payment_integrations;

-- 3. Test Query (as Public/Anon)
-- Should fail or return nothing
-- SET LOCAL ROLE anon;
-- SELECT * FROM payment_integrations;

-- 4. Test Query (as Unrelated User)
-- Should return nothing
