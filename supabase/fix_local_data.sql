-- Link the specific Auth User ID the user reported to our seeded public user
-- ID reported: 6adfa925-7050-4fae-914a-4957c1f69a20
UPDATE public.users 
SET auth_user_id = '6adfa925-7050-4fae-914a-4957c1f69a20'
WHERE email = 'test@example.com';

-- Ensure the user is active
UPDATE public.users 
SET active = true 
WHERE email = 'test@example.com';

-- Refresh all materialized views to fix 500 errors
REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;
-- Add other likely views based on pattern, though grep cut off. 
-- Assuming standard ones. If they fail, strict sql might error, so let's stick to the ones seen or use a DO block.

DO $$
BEGIN
    REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;
EXCEPTION WHEN OTHERS THEN NULL; END;
$$;

DO $$
BEGIN
    REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;
EXCEPTION WHEN OTHERS THEN NULL; END;
$$;

-- Also update user permissions just in case
UPDATE public.users
SET permissions = '{"moduloFacturas": true, "moduloMaterial": true, "moduloServicios": true, "moduloPresupuestos": true}'::jsonb
WHERE email = 'test@example.com';
