/*
  CRITICAL SECURITY FIX - 2026-02-17
  
  This script addresses high-severity vulnerabilities discovered in the security audit:
  1. Removes SECURITY DEFINER from views that were bypassing RLS policies.
  2. Sets a safe 'search_path' on critical SECURITY DEFINER functions to prevent hijacking.
  3. Adds basic RLS policies to tables that had RLS enabled but no policies (effectively deny-all).
*/

-- -----------------------------------------------------------------------------
-- 1. REMOVE SECURITY DEFINER FROM VIEWS
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER views run with the privileges of the creator (usually postgres/superuser),
-- bypassing the RLS policies on the underlying tables. We change them to default (INVOKER)
-- so they respect the current user's RLS Context.

-- client_visible_bookings
-- ALTER VIEW public.client_visible_bookings OWNER TO postgres; -- Owner real detectado
ALTER VIEW public.client_visible_bookings SET (security_invoker = true); 

-- admin_pending_users
-- ALTER VIEW public.admin_pending_users OWNER TO service_role;
ALTER VIEW public.admin_pending_users SET (security_invoker = true);

-- users_with_company
-- ALTER VIEW public.users_with_company OWNER TO service_role;
ALTER VIEW public.users_with_company SET (security_invoker = true);

-- user_company_context
-- ALTER VIEW public.user_company_context OWNER TO service_role;
ALTER VIEW public.user_company_context SET (security_invoker = true);

-- invoiceseries (view)
-- ALTER VIEW public.invoiceseries OWNER TO service_role;
ALTER VIEW public.invoiceseries SET (security_invoker = true);

-- client_visible_services
-- ALTER VIEW public.client_visible_services OWNER TO service_role;
ALTER VIEW public.client_visible_services SET (security_invoker = true);

-- v_current_user_modules
-- ALTER VIEW public.v_current_user_modules OWNER TO service_role;
ALTER VIEW public.v_current_user_modules SET (security_invoker = true);

-- client_visible_tickets
-- ALTER VIEW public.client_visible_tickets OWNER TO service_role;
ALTER VIEW public.client_visible_tickets SET (security_invoker = true);

-- client_visible_quotes
-- ALTER VIEW public.client_visible_quotes OWNER TO service_role;
ALTER VIEW public.client_visible_quotes SET (security_invoker = true);


-- -----------------------------------------------------------------------------
-- 2. SECURE FUNCTIONS (SET search_path)
-- -----------------------------------------------------------------------------
-- Functions running as SECURITY DEFINER must have a fixed search_path to prevent
-- malicious users from creating objects in 'public' that override system functions.

-- Helper macro to ease reading (conceptually, we just ALTER each one)

ALTER FUNCTION public.get_next_ticket_number(uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.admin_set_company_module(uuid, text, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_effective_modules(uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.initialize_mail_account_folders(uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.column_exists(text, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.current_company_id() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.anonymize_invoice_data() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.finalize_invoice(uuid, text, text, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.upsert_client(jsonb) SET search_path = public, extensions, pg_temp;

-- Verifactu specific (if they exist in public or their schema)
-- Note: Adjust schema if 'verifactu' schema exists, else assume public or skip if error
DO $$
BEGIN
    BEGIN
        ALTER FUNCTION verifactu.get_next_invoice_number(uuid, uuid) SET search_path = verifactu, public, extensions, pg_temp;
    EXCEPTION WHEN undefined_function THEN
        -- Function does not exist, skip
    END;
    BEGIN
        ALTER FUNCTION verifactu.move_to_dlq(uuid, text) SET search_path = verifactu, public, extensions, pg_temp;
    EXCEPTION WHEN undefined_function THEN
        -- Function does not exist, skip
    END;
    BEGIN
        ALTER FUNCTION verifactu.compute_vat_breakdown(jsonb) SET search_path = verifactu, public, extensions, pg_temp;
    EXCEPTION WHEN undefined_function THEN
        -- Function does not exist, skip
    END;
END $$;


-- -----------------------------------------------------------------------------
-- 3. FIX TABLES WITH RLS ENABLED BUT NO POLICIES (DENY-ALL)
-- -----------------------------------------------------------------------------
-- These tables currently reject all access. We add a basic policy dependent on 
-- company membership or admin status, assuming standard SaaS multi-tenancy.

-- availability_schedules
-- Note: 'availability_schedules' does not have 'company_id'. Users can only see their own schedules.
CREATE POLICY "availability_schedules_owner_isolation" ON public.availability_schedules
    FOR ALL
    USING (user_id = auth.uid());


-- company_stage_order
-- No company_id column. Policy not created. Add if/when multi-tenancy is clarified.


-- company_ticket_sequences
-- No company_id column. Policy not created. Add if/when multi-tenancy is clarified.



-- invoice_meta
-- No company_id column. Policy not created. Add if/when multi-tenancy is clarified.

-- services_tags
-- Note: 'services_tags' links services to tags. It only has service_id and tag_id. 
-- We verify access through the service -> company relationship.
CREATE POLICY "services_tags_company_isolation" ON public.services_tags
    FOR ALL
    USING (service_id IN (
        SELECT s.id FROM public.services s
        WHERE s.company_id IN (
             SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
        )
    ));

-- tag_scopes (assuming this might be global or company based, defaulting to authenticated read)
CREATE POLICY "tag_scopes_read_authenticated" ON public.tag_scopes
    FOR SELECT
    TO authenticated
    USING (true);

-- verifactu_invoice_meta
-- No id column in invoice_meta. Policy not created. Add if/when correct join column is clarified.

