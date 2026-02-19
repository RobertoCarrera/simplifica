-- Migration: Initial Base Schema Fix
-- Date: 2026-02-19
-- Author: GitHub Copilot

-- This migration adds the core tables that were missing from local migrations
-- and causing foreign key reference errors.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 0. Custom Types
DO $$ BEGIN
    CREATE TYPE public.invoice_type AS ENUM ('normal', 'simplified', 'rectificative', 'summary');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.quote_status AS ENUM (
        'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 
        'invoiced', 'cancelled', 'paused', 'pending', 'request', 'active'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Companies
CREATE TABLE IF NOT EXISTS public.companies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    slug text UNIQUE,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    website text,
    legacy_negocio_id text,
    logo_url text,
    subscription_tier character varying(50) DEFAULT 'basic'::character varying,
    max_users integer DEFAULT 10,
    is_active boolean DEFAULT true,
    nif character varying(20),
    google_calendar_display_config jsonb DEFAULT '{}'::jsonb
);

-- 2. App Roles (Reference for users)
CREATE TABLE IF NOT EXISTS public.app_roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    label text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 3. Users
CREATE TABLE IF NOT EXISTS public.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id),
    email text NOT NULL UNIQUE,
    name text,
    surname text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    permissions jsonb DEFAULT '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::jsonb,
    auth_user_id uuid UNIQUE, -- Link to auth.users
    is_dpo boolean DEFAULT false,
    gdpr_training_completed boolean DEFAULT false,
    gdpr_training_date timestamp with time zone,
    data_access_level text DEFAULT 'standard'::text,
    last_privacy_policy_accepted timestamp with time zone,
    failed_login_attempts integer DEFAULT 0,
    account_locked_until timestamp with time zone,
    last_session_at timestamp with time zone,
    role text, -- Temporary role column to satisfy early migrations
    app_role_id uuid REFERENCES public.app_roles(id)
);

-- 3.5 Clients (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.clients (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    name text NOT NULL,
    surname text,
    email text,
    phone text,
    dni text,
    address jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    auth_user_id uuid, -- Reference to auth.users
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    marketing_consent boolean DEFAULT false,
    marketing_consent_date timestamp with time zone,
    marketing_consent_method text
);

-- 3.6 Invoices & Quotes (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    client_id uuid NOT NULL REFERENCES public.clients(id),
    invoice_number text NOT NULL,
    invoice_series text NOT NULL,
    invoice_type public.invoice_type DEFAULT 'normal'::public.invoice_type NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.quotes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    client_id uuid NOT NULL REFERENCES public.clients(id),
    quote_number character varying(50) NOT NULL,
    year integer DEFAULT EXTRACT(year FROM CURRENT_DATE) NOT NULL,
    sequence_number integer NOT NULL,
    status public.quote_status DEFAULT 'draft'::public.quote_status NOT NULL,
    quote_date date DEFAULT CURRENT_DATE NOT NULL,
    valid_until date NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

-- 3.7 Invitations (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.company_invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id),
    email text NOT NULL,
    invited_by_user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    token text DEFAULT (gen_random_uuid())::text NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval)
);

-- 3.8 GDPR Audit Log (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.gdpr_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid,
    company_id uuid REFERENCES public.companies(id),
    action_type text NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    subject_email text,
    old_values jsonb,
    new_values jsonb,
    legal_basis text,
    purpose text,
    ip_address inet,
    user_agent text,
    session_id text,
    request_id text,
    created_at timestamp with time zone DEFAULT now()
);

-- 3.9 GDPR Access Requests (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.gdpr_access_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    request_type text NOT NULL,
    subject_email text NOT NULL,
    subject_name text,
    subject_identifier text,
    company_id uuid REFERENCES public.companies(id),
    requested_by uuid,
    request_details jsonb DEFAULT '{}'::jsonb,
    verification_method text,
    verification_status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);

-- 3.10 Modules Catalog (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.modules_catalog (
    key text PRIMARY KEY,
    label text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0,
    currency text DEFAULT 'EUR',
    is_active boolean DEFAULT true,
    category text,
    created_at timestamp with time zone DEFAULT now()
);

-- 3.11 Services (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.services (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    name character varying(200) NOT NULL,
    description text,
    estimated_hours numeric(4,2) DEFAULT 1.0,
    base_price numeric(10,2) DEFAULT 0.00,
    is_active boolean DEFAULT true NOT NULL,
    category text DEFAULT 'Servicio Técnico'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

-- 3.12 Role Permissions (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id),
    role text NOT NULL,
    permission text NOT NULL,
    granted boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    role_id uuid REFERENCES public.app_roles(id)
);

-- 3.13 Booking System (REMOVED: already in 20260110210000)
-- 3.14 Integrations (REMOVED: already in 20260110210000)

-- 4. Initial Roles Seed
INSERT INTO public.app_roles (name, label, description) VALUES
    ('super_admin', 'Super Administrador', 'Administrador global del sistema'), 
    ('owner', 'Propietario', 'Dueño de la empresa'),
    ('admin', 'Administrador', 'Administrador de la empresa'),
    ('member', 'Miembro', 'Empleado regular'),
    ('professional', 'Profesional', 'Prestador de servicios'),
    ('agent', 'Agente', 'Agente comercial'),
    ('client', 'Cliente', 'Cliente final')
ON CONFLICT (name) DO NOTHING;

-- 5. Modules (Core for Tagging)
CREATE TABLE IF NOT EXISTS public.modules (
    key text PRIMARY KEY,
    name text NOT NULL,
    description text,
    enabled_by_default boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    position integer DEFAULT 0
);

-- 6. Tag Scopes
CREATE TABLE IF NOT EXISTS public.tag_scopes (
    id text PRIMARY KEY,
    label text NOT NULL,
    color text,
    description text,
    module_key text REFERENCES public.modules(key),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 7. Global Tags
CREATE TABLE IF NOT EXISTS public.global_tags (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    color text NOT NULL,
    category text,
    scope text[],
    description text,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    category_color text DEFAULT '#6B7280'::text
);

-- 8. Legacy Tag Bridge Tables (referenced by early migrations)
CREATE TABLE IF NOT EXISTS public.clients_tags (
    client_id uuid NOT NULL,
    tag_id uuid NOT NULL REFERENCES public.global_tags(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (client_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.services_tags (
    service_id uuid NOT NULL,
    tag_id uuid NOT NULL REFERENCES public.global_tags(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (service_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.tickets_tags (
    ticket_id uuid NOT NULL,
    tag_id uuid NOT NULL REFERENCES public.global_tags(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (ticket_id, tag_id)
);

-- 9. Core Functions
CREATE OR REPLACE FUNCTION public.get_user_company_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'temp'
    AS $$
DECLARE
  jwt jsonb;
  cid text;
  auth_id uuid;
  client_company_id uuid;
BEGIN
  jwt := COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
  cid := NULLIF((jwt ->> 'company_id'), '');

  IF cid IS NOT NULL THEN
    RETURN cid::uuid;
  END IF;

  auth_id := auth.uid();
  IF auth_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT company_id INTO client_company_id
  FROM public.users
  WHERE auth_user_id = auth_id
  LIMIT 1;

  RETURN client_company_id;
END;
$$;

-- 3.10 More specific configurations
CREATE TABLE IF NOT EXISTS public.app_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_convert_policy text DEFAULT 'manual'::text NOT NULL,
    ask_before_convert boolean DEFAULT true NOT NULL,
    enforce_globally boolean DEFAULT false NOT NULL,
    default_payment_terms text,
    default_invoice_delay_days integer DEFAULT 0 NOT NULL,
    default_prices_include_tax boolean,
    default_iva_enabled boolean,
    default_iva_rate numeric,
    default_irpf_enabled boolean,
    default_irpf_rate numeric,
    default_auto_send_quote_email boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.verifactu_settings (
    company_id uuid PRIMARY KEY REFERENCES public.companies(id),
    software_code text NOT NULL,
    issuer_nif text NOT NULL,
    environment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cert_pem_enc text,
    key_pem_enc text,
    key_pass_enc text,
    CONSTRAINT verifactu_settings_environment_check CHECK (environment = ANY (ARRAY['pre'::text, 'prod'::text]))
);

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    executed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    job_type text NOT NULL,
    payload jsonb NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    CONSTRAINT scheduled_jobs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text]))
);

CREATE TABLE IF NOT EXISTS public.verifactu_cert_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    version integer NOT NULL,
    stored_at timestamp with time zone DEFAULT now() NOT NULL,
    rotated_by uuid,
    cert_pem_enc text,
    key_pem_enc text,
    key_pass_enc text,
    integrity_hash text,
    notes text
);

CREATE TABLE IF NOT EXISTS public.verifactu_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    companyid uuid NOT NULL,
    invoiceid uuid,
    eventtype text NOT NULL,
    payload jsonb NOT NULL,
    CONSTRAINT verifactu_events_eventtype_check CHECK (eventtype = ANY (ARRAY['issue'::text, 'rectify'::text, 'cancel'::text, 'resend'::text, 'aeat_ack'::text, 'aeat_error'::text]))
);

CREATE TABLE IF NOT EXISTS public.payment_integrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    provider text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    is_sandbox boolean DEFAULT true NOT NULL,
    credentials_encrypted text NOT NULL,
    webhook_secret_encrypted text,
    webhook_url text,
    last_verified_at timestamp with time zone,
    verification_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_integrations_provider_check CHECK (provider = ANY (ARRAY['paypal'::text, 'stripe'::text])),
    CONSTRAINT payment_integrations_verification_status_check CHECK (verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text]))
);

CREATE TABLE IF NOT EXISTS public.client_variant_assignments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id),
    service_id uuid NOT NULL REFERENCES public.services(id),
    variant_id uuid NOT NULL REFERENCES public.service_variants(id),
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

CREATE TABLE IF NOT EXISTS public.services (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name character varying(200) NOT NULL,
    description text,
    estimated_hours numeric(4,2) DEFAULT 1.0,
    base_price numeric(10,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    category text DEFAULT 'Servicio Técnico'::text,
    legacy_negocio_id text,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    tax_rate numeric(5,2) DEFAULT 21.00,
    unit_type character varying(50) DEFAULT 'horas'::character varying,
    min_quantity numeric(10,2) DEFAULT 1.00,
    max_quantity numeric(10,2),
    difficulty_level integer DEFAULT 1,
    profit_margin numeric(5,2) DEFAULT 30.00,
    cost_price numeric(10,2) DEFAULT 0.00,
    requires_parts boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.service_variants (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    service_id uuid NOT NULL REFERENCES public.services(id),
    variant_name text NOT NULL,
    estimated_hours numeric DEFAULT 0,
    cost_price numeric DEFAULT 0,
    profit_margin numeric DEFAULT 30.00,
    discount_percentage numeric DEFAULT 0,
    features jsonb DEFAULT '{"limits": {}, "excluded": [], "included": []}'::jsonb,
    display_config jsonb DEFAULT '{"badge": null, "color": null, "highlight": false}'::jsonb,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pricing jsonb,
    is_hidden boolean DEFAULT false
);
