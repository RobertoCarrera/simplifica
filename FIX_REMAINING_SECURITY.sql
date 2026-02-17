/*
  REMAINING SECURITY FIXES - 2026-02-17
  
  This script addresses Medium/Low severity vulnerabilities found in the follow-up audit:
  1. Fixes 'search_path' for functions identified as mutable (improves security/deterministic behavior).
     - Uses a dynamic PL/pgSQL block to find functions by name and apply the fix safely.
  2. Provides templates for missing RLS policies on tables that currently have "Deny All" access.
*/

-- -----------------------------------------------------------------------------
-- 1. FIX MUTABLE SEARCH_PATH (DYNAMICALLY)
-- -----------------------------------------------------------------------------
-- This block searches for specific functions flagged by the security advisor 
-- and enforces a safe search_path (public, extensions, pg_temp).

DO $$
DECLARE
    r RECORD;
    v_func_names text[] := ARRAY[
        'get_next_invoice_number',
        'compute_vat_breakdown',
        'handle_project_auto_move',
        'f_mail_get_thread_messages',
        'reject_client_consent',
        'insert_or_get_address',
        'cancel_invoice',
        'admin_list_companies',
        'auth_user_email',
        'fn_invoice_immutable_after_issue',
        'fn_touch_updated_at',
        'gdpr_audit_trigger',
        'calculate_invoice_totals_payment_trigger',
        'match_product_catalog',
        'anonymize_quote_data',
        'update_quotes_updated_at',
        'f_mail_get_threads',
        'fn_verifactu_settings_enforce_modes',
        'get_top_used_products',
        'verifactu_process_pending_events',
        'update_verifactu_settings_updated_at',
        'update_customer_dev',
        'create_customer_dev',
        'handle_invoice_verifactu',
        'calculate_quote_item_totals',
        'get_company_schedule',
        'gdpr_export_client_data',
        'set_updated_at',
        'ensure_min_one_stage_per_category',
        'restore_original_invoice_on_void',
        'create_default_project_stages',
        'calculate_quote_totals',
        'mark_expired_quotes',
        'set_updated_at_ticket_products',
        'trigger_init_mail_folders',
        'update_updated_at_column',
        'set_quote_month',
        'calculate_annual_price',
        'accept_company_invitation',
        'mark_project_as_read',
        'set_invoice_month',
        'invoices_immutability_guard',
        'update_service_variants_updated_at',
        'gdpr_audit_clients_trigger',
        'debug_client_modules',
        'process_client_consent',
        'get_client_consent_request',
        'set_updated_at_timestamp',
        'update_payment_integrations_updated_at',
        'link_pending_professional',
        'get_top_used_services',
        'calculate_invoice_totals_trigger',
        'set_ticket_month'
    ];
BEGIN
    FOR r IN 
        SELECT 
            quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ')' as func_sig,
            p.proname,
            CASE 
                WHEN p.prokind = 'p' THEN 'PROCEDURE'
                ELSE 'FUNCTION'
            END as obj_type
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = ANY(v_func_names)
        AND n.nspname IN ('public', 'verifactu')
    LOOP
        RAISE NOTICE 'Securing %: %', r.obj_type, r.func_sig;
        EXECUTE 'ALTER ' || r.obj_type || ' ' || r.func_sig || ' SET search_path = public, extensions, pg_temp';
    END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 2. ADDRESS TABLES WITH RLS ENABLED BUT NO POLICIES (DENY ALL)
-- -----------------------------------------------------------------------------
-- The following tables have RLS enabled but 0 policies, meaning NOBODY can access them
-- via the API. If this is intended (internal use only), no action is needed.
-- If they are used by the app, uncomment and adapt the policies below.

-- Table: public.company_stage_order
-- Policy Suggestion:
/*
CREATE POLICY "company_stage_order_access" ON public.company_stage_order
    FOR ALL
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));
*/

-- Table: public.company_ticket_sequences
-- Policy Suggestion:
/*
CREATE POLICY "company_ticket_sequences_access" ON public.company_ticket_sequences
    FOR ALL
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));
*/

-- Table: public.invoice_meta
-- Policy Suggestion:
/*
CREATE POLICY "invoice_meta_access" ON public.invoice_meta
    FOR ALL
    USING (
        -- Assuming link via invoice table or direct company_id (verify schema)
        -- company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    );
*/

-- Table: public.verifactu_invoice_meta
-- Policy Suggestion:
/*
CREATE POLICY "verifactu_invoice_meta_access" ON public.verifactu_invoice_meta
    FOR ALL
    USING (
         -- Link to invoice -> company
         invoice_id IN (
            SELECT id FROM public.invoices 
            WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
         )
    );
*/
