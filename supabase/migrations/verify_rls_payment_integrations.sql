-- VERIFICATION SCRIPT
-- Run this script manually to verify the fix.

-- 1. Setup: Create two companies and two users (admin of A, admin of B)
-- (This assumes you have a way to create them or they exist. Below is a conceptual test)

BEGIN;

-- Assumption: User 'admin_a' belongs to 'company_a'
-- Assumption: User 'admin_b' belongs to 'company_b'

-- Switch to admin_a
-- SET ROLE authenticated;
-- SET request.jwt.claim.sub = 'uuid-of-admin-a';

-- Test 1: Admin A tries to select payment integrations of Company A (Should SUCCEED)
-- SELECT * FROM payment_integrations WHERE company_id = 'uuid-of-company-a';

-- Test 2: Admin A tries to select payment integrations of Company B (Should FAIL/RETURN EMPTY)
-- SELECT * FROM payment_integrations WHERE company_id = 'uuid-of-company-b';

-- Test 3: Admin A tries to update payment integrations of Company B (Should FAIL)
-- UPDATE payment_integrations SET is_active = false WHERE company_id = 'uuid-of-company-b';

ROLLBACK;
