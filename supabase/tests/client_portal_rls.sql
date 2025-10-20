-- Client Portal RLS smoke tests
-- Run with psql or Supabase SQL editor in a safe dev environment.

SET search_path = public;

-- Pre-reqs (replace UUIDs/emails for your env):
-- 1) Ensure companies, clients, users exist.
-- 2) Create one mapping for client A and another user for client B.

-- Example seed (comment/uncomment and replace values):
-- INSERT INTO client_portal_users(company_id, client_id, email)
-- VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000AA', 'alice@example.com')
-- ON CONFLICT DO NOTHING;

-- Simulate JWT claim context (only for dev via psql):
-- SELECT set_config('request.jwt.claims', '{"email":"alice@example.com"}', true);

-- Test: tickets visible are only those belonging to mapped client
-- SELECT id, client_id, company_id FROM client_visible_tickets LIMIT 20;

-- Test: quotes visible are only those belonging to mapped client
-- SELECT id, client_id, company_id, status FROM client_visible_quotes LIMIT 20;

-- Negative test: switch to an email without mapping
-- SELECT set_config('request.jwt.claims', '{"email":"unknown@example.com"}', true);
-- Expect empty result sets
-- SELECT count(*) FROM client_visible_tickets; -- -> 0
-- SELECT count(*) FROM client_visible_quotes;  -- -> 0
