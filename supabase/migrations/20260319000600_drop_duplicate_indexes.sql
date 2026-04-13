-- Migration: Drop duplicate indexes identified by Supabase advisor
-- Each pair below has identical underlying expressions; we keep the better-named one.

-- ai_usage_logs: keep idx_ai_usage_logs_company_id
DROP INDEX IF EXISTS public.idx_ai_logs_company;

-- bookings: keep idx_bookings_service_id
DROP INDEX IF EXISTS public.idx_bookings_service;

-- client_variant_assignments: keep idx_client_variant_assignments_variant
DROP INDEX IF EXISTS public.idx_cva_variant_id;

-- gdpr_access_requests: keep idx_gdpr_access_requests_subject_email
DROP INDEX IF EXISTS public.idx_gdpr_access_requests_email;

-- gdpr_consent_records: keep idx_gdpr_consent_records_subject_email
DROP INDEX IF EXISTS public.idx_gdpr_consent_records_email;

-- invoices: keep idx_invoices_date (standard naming convention)
DROP INDEX IF EXISTS public.ix_invoices_date;

-- project_stages: keep the UNIQUE constraint versions (enforce uniqueness)
DROP INDEX IF EXISTS public.idx_one_default_per_company;
DROP INDEX IF EXISTS public.idx_one_landing_per_company;
DROP INDEX IF EXISTS public.idx_one_review_per_company;

-- quote_items: keep idx_quote_items_service_id
DROP INDEX IF EXISTS public.idx_quote_items_service;

-- quotes: keep idx_quotes_client_id
DROP INDEX IF EXISTS public.idx_quotes_client;

-- verifactu_settings: keep primary key (verifactu_settings_pkey), drop redundant unique
ALTER TABLE public.verifactu_settings
  DROP CONSTRAINT IF EXISTS verifactu_settings_company_id_key;
