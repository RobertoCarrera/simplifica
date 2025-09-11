-- ========================================
-- GDPR COMPLIANCE SCHEMA FOR SPANISH CRM
-- ========================================
-- This migration implements comprehensive GDPR compliance requirements
-- including data subject rights, consent management, audit trails, and security

BEGIN;

-- ========================================
-- 1. GDPR AUDIT TABLES
-- ========================================

-- Data Processing Activities Log (GDPR Article 30)
CREATE TABLE IF NOT EXISTS public.gdpr_processing_activities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    activity_name text NOT NULL,
    purpose text NOT NULL,
    legal_basis text NOT NULL, -- consent, contract, legal_obligation, vital_interests, public_task, legitimate_interests
    data_categories text[] NOT NULL, -- ['personal_identification', 'contact_info', 'financial', 'special_category']
    data_subjects text[] NOT NULL, -- ['customers', 'employees', 'suppliers']
    recipients text[], -- who receives the data
    retention_period interval,
    security_measures jsonb DEFAULT '{}',
    cross_border_transfers jsonb DEFAULT '{}',
    dpo_assessment text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);

-- Data Subject Access Requests (GDPR Article 15)
CREATE TABLE IF NOT EXISTS public.gdpr_access_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    request_type text NOT NULL, -- 'access', 'rectification', 'erasure', 'portability', 'restriction', 'objection'
    subject_email text NOT NULL,
    subject_name text,
    subject_identifier text, -- DNI or other ID
    company_id uuid REFERENCES public.companies(id),
    requested_by uuid REFERENCES auth.users(id),
    request_details jsonb DEFAULT '{}',
    verification_method text, -- 'email', 'dni', 'phone', 'in_person'
    verification_status text DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    processing_status text DEFAULT 'received', -- 'received', 'in_progress', 'completed', 'rejected'
    response_data jsonb,
    response_file_url text,
    legal_basis_for_delay text,
    deadline_date timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_request_type CHECK (request_type IN ('access', 'rectification', 'erasure', 'portability', 'restriction', 'objection')),
    CONSTRAINT valid_verification_status CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    CONSTRAINT valid_processing_status CHECK (processing_status IN ('received', 'in_progress', 'completed', 'rejected'))
);

-- Data Breach Incidents (GDPR Article 33-34)
CREATE TABLE IF NOT EXISTS public.gdpr_breach_incidents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    incident_reference text UNIQUE NOT NULL,
    breach_type text[] NOT NULL, -- ['confidentiality', 'integrity', 'availability']
    discovered_at timestamp with time zone NOT NULL,
    reported_at timestamp with time zone,
    reported_to_dpa boolean DEFAULT false,
    dpa_reference text,
    data_subjects_notified boolean DEFAULT false,
    notification_method text,
    affected_data_categories text[],
    estimated_affected_subjects integer,
    likely_consequences text,
    mitigation_measures text,
    preventive_measures text,
    severity_level text, -- 'low', 'medium', 'high', 'critical'
    company_id uuid REFERENCES public.companies(id),
    reported_by uuid REFERENCES auth.users(id),
    incident_details jsonb DEFAULT '{}',
    resolution_status text DEFAULT 'open', -- 'open', 'investigating', 'contained', 'resolved'
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_severity CHECK (severity_level IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT valid_resolution_status CHECK (resolution_status IN ('open', 'investigating', 'contained', 'resolved'))
);

-- Consent Management (GDPR Article 7)
CREATE TABLE IF NOT EXISTS public.gdpr_consent_records (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    subject_id uuid, -- references clients.id
    subject_email text NOT NULL,
    consent_type text NOT NULL, -- 'marketing', 'analytics', 'data_processing', 'third_party_sharing'
    purpose text NOT NULL,
    consent_given boolean NOT NULL,
    consent_method text NOT NULL, -- 'form', 'email', 'phone', 'in_person', 'website'
    consent_evidence jsonb DEFAULT '{}', -- IP, timestamp, form data, etc.
    withdrawn_at timestamp with time zone,
    withdrawal_method text,
    withdrawal_evidence jsonb DEFAULT '{}',
    company_id uuid REFERENCES public.companies(id),
    processed_by uuid REFERENCES auth.users(id),
    legal_basis text,
    data_processing_purposes text[],
    retention_period interval,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean GENERATED ALWAYS AS (withdrawn_at IS NULL) STORED
);

-- Data Processing Audit Log
CREATE TABLE IF NOT EXISTS public.gdpr_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    company_id uuid REFERENCES public.companies(id),
    action_type text NOT NULL, -- 'create', 'read', 'update', 'delete', 'export', 'anonymize'
    table_name text NOT NULL,
    record_id uuid,
    subject_email text, -- email of the data subject affected
    old_values jsonb,
    new_values jsonb,
    legal_basis text,
    purpose text,
    ip_address inet,
    user_agent text,
    session_id text,
    request_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_action_type CHECK (action_type IN ('create', 'read', 'update', 'delete', 'export', 'anonymize', 'consent', 'access_request'))
);

-- ========================================
-- 2. ENHANCE EXISTING TABLES FOR GDPR
-- ========================================

-- Add GDPR fields to clients table
DO $$
BEGIN
    -- Add consent fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'marketing_consent') THEN
        ALTER TABLE public.clients ADD COLUMN marketing_consent boolean DEFAULT false;
        ALTER TABLE public.clients ADD COLUMN marketing_consent_date timestamp with time zone;
        ALTER TABLE public.clients ADD COLUMN marketing_consent_method text;
    END IF;
    
    -- Add data processing consent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'data_processing_consent') THEN
        ALTER TABLE public.clients ADD COLUMN data_processing_consent boolean DEFAULT true;
        ALTER TABLE public.clients ADD COLUMN data_processing_consent_date timestamp with time zone DEFAULT now();
        ALTER TABLE public.clients ADD COLUMN data_processing_legal_basis text DEFAULT 'contract';
    END IF;
    
    -- Add data retention and deletion tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'data_retention_until') THEN
        ALTER TABLE public.clients ADD COLUMN data_retention_until timestamp with time zone;
        ALTER TABLE public.clients ADD COLUMN deletion_requested_at timestamp with time zone;
        ALTER TABLE public.clients ADD COLUMN deletion_reason text;
        ALTER TABLE public.clients ADD COLUMN anonymized_at timestamp with time zone;
    END IF;
    
    -- Add privacy flags
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'is_minor') THEN
        ALTER TABLE public.clients ADD COLUMN is_minor boolean DEFAULT false;
        ALTER TABLE public.clients ADD COLUMN parental_consent_verified boolean DEFAULT false;
        ALTER TABLE public.clients ADD COLUMN parental_consent_date timestamp with time zone;
    END IF;
    
    -- Add data minimization flags
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'data_minimization_applied') THEN
        ALTER TABLE public.clients ADD COLUMN data_minimization_applied boolean DEFAULT false;
        ALTER TABLE public.clients ADD COLUMN last_data_review_date timestamp with time zone;
    END IF;
    
    -- Add access control metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'access_restrictions') THEN
        ALTER TABLE public.clients ADD COLUMN access_restrictions jsonb DEFAULT '{}';
        ALTER TABLE public.clients ADD COLUMN last_accessed_at timestamp with time zone;
        ALTER TABLE public.clients ADD COLUMN access_count integer DEFAULT 0;
    END IF;
END $$;

-- Add GDPR fields to users table
DO $$
BEGIN
    -- Add privacy officer designation
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_dpo') THEN
        ALTER TABLE public.users ADD COLUMN is_dpo boolean DEFAULT false;
        ALTER TABLE public.users ADD COLUMN gdpr_training_completed boolean DEFAULT false;
        ALTER TABLE public.users ADD COLUMN gdpr_training_date timestamp with time zone;
    END IF;
    
    -- Add access control
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'data_access_level') THEN
        ALTER TABLE public.users ADD COLUMN data_access_level text DEFAULT 'standard'; -- 'minimal', 'standard', 'elevated', 'admin'
        ALTER TABLE public.users ADD COLUMN last_privacy_policy_accepted timestamp with time zone;
        ALTER TABLE public.users ADD COLUMN failed_login_attempts integer DEFAULT 0;
        ALTER TABLE public.users ADD COLUMN account_locked_until timestamp with time zone;
    END IF;
END $$;

-- ========================================
-- 3. GDPR COMPLIANCE FUNCTIONS
-- ========================================

-- Function to anonymize client data (GDPR Right to Erasure)
CREATE OR REPLACE FUNCTION gdpr_anonymize_client(
    client_id uuid,
    requesting_user_id uuid,
    anonymization_reason text DEFAULT 'gdpr_erasure_request'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    client_record record;
    anonymized_data jsonb;
BEGIN
    -- Get client record
    SELECT * INTO client_record FROM public.clients WHERE id = client_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;
    
    -- Create anonymized data structure
    anonymized_data := jsonb_build_object(
        'original_id', client_record.id,
        'anonymized_at', now(),
        'anonymized_by', requesting_user_id,
        'reason', anonymization_reason,
        'original_email_hash', md5(client_record.email),
        'original_dni_hash', md5(COALESCE(client_record.dni, ''))
    );
    
    -- Update client with anonymized data
    UPDATE public.clients SET
        name = 'ANONYMIZED_' || left(md5(client_record.name), 8),
        email = 'anonymized.' || left(md5(client_record.email), 8) || '@anonymized.local',
        phone = NULL,
        dni = NULL,
        address = jsonb_build_object('anonymized', true),
        metadata = jsonb_build_object('anonymized', true, 'original_metadata', anonymized_data),
        anonymized_at = now(),
        updated_at = now()
    WHERE id = client_id;
    
    -- Log the anonymization
    INSERT INTO public.gdpr_audit_log (
        user_id, action_type, table_name, record_id, 
        subject_email, purpose, created_at
    ) VALUES (
        requesting_user_id, 'anonymize', 'clients', client_id,
        client_record.email, anonymization_reason, now()
    );
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Client data anonymized successfully',
        'anonymized_id', client_id,
        'anonymized_at', now()
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;

-- Function to export all client data (GDPR Right to Data Portability)
CREATE OR REPLACE FUNCTION gdpr_export_client_data(
    client_email text,
    requesting_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    client_data jsonb;
    related_data jsonb;
BEGIN
    -- Get main client data
    SELECT jsonb_build_object(
        'personal_data', jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'email', c.email,
            'phone', c.phone,
            'dni', c.dni,
            'address', c.address,
            'created_at', c.created_at,
            'updated_at', c.updated_at
        ),
        'consent_records', (
            SELECT jsonb_agg(jsonb_build_object(
                'consent_type', consent_type,
                'purpose', purpose,
                'consent_given', consent_given,
                'consent_method', consent_method,
                'created_at', created_at,
                'withdrawn_at', withdrawn_at
            ))
            FROM public.gdpr_consent_records 
            WHERE subject_email = client_email
        ),
        'processing_activities', (
            SELECT jsonb_agg(jsonb_build_object(
                'activity_name', activity_name,
                'purpose', purpose,
                'legal_basis', legal_basis,
                'retention_period', retention_period
            ))
            FROM public.gdpr_processing_activities
            WHERE 'customers' = ANY(data_subjects)
        )
    ) INTO client_data
    FROM public.clients c
    WHERE c.email = client_email;
    
    -- Log the data export
    INSERT INTO public.gdpr_audit_log (
        user_id, action_type, table_name, subject_email, 
        purpose, created_at
    ) VALUES (
        requesting_user_id, 'export', 'clients', client_email,
        'gdpr_data_portability_request', now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'export_date', now(),
        'exported_by', requesting_user_id,
        'data', client_data
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Function to log GDPR audit events
CREATE OR REPLACE FUNCTION gdpr_log_access(
    user_id uuid,
    action_type text,
    table_name text,
    record_id uuid DEFAULT NULL,
    subject_email text DEFAULT NULL,
    purpose text DEFAULT NULL,
    old_values jsonb DEFAULT NULL,
    new_values jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.gdpr_audit_log (
        user_id, action_type, table_name, record_id,
        subject_email, purpose, old_values, new_values,
        ip_address, created_at
    ) VALUES (
        user_id, action_type, table_name, record_id,
        subject_email, purpose, old_values, new_values,
        inet_client_addr(), now()
    );
END;
$$;

-- ========================================
-- 4. GDPR COMPLIANCE TRIGGERS
-- ========================================

-- Trigger to log all client data modifications
CREATE OR REPLACE FUNCTION gdpr_audit_clients_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM gdpr_log_access(
            auth.uid(),
            'create',
            'clients',
            NEW.id,
            NEW.email,
            'client_creation',
            NULL,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM gdpr_log_access(
            auth.uid(),
            'update',
            'clients',
            NEW.id,
            NEW.email,
            'client_modification',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM gdpr_log_access(
            auth.uid(),
            'delete',
            'clients',
            OLD.id,
            OLD.email,
            'client_deletion',
            to_jsonb(OLD),
            NULL
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Apply audit trigger to clients table
DROP TRIGGER IF EXISTS gdpr_audit_clients ON public.clients;
CREATE TRIGGER gdpr_audit_clients
    AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION gdpr_audit_clients_trigger();

-- ========================================
-- 5. GDPR SECURITY POLICIES
-- ========================================

-- Enhanced RLS policies for GDPR compliance
ALTER TABLE public.gdpr_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_breach_incidents ENABLE ROW LEVEL SECURITY;

-- Audit log access - only DPO and admins can view
CREATE POLICY gdpr_audit_log_access ON public.gdpr_audit_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.auth_user_id = auth.uid() 
            AND (u.is_dpo = true OR u.data_access_level IN ('admin', 'elevated'))
        )
    );

-- Access requests - users can view their company's requests
CREATE POLICY gdpr_access_requests_company ON public.gdpr_access_requests
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM public.users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- Consent records - users can manage their company's consent records
CREATE POLICY gdpr_consent_records_company ON public.gdpr_consent_records
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM public.users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- ========================================
-- 6. GDPR COMPLIANCE VIEWS
-- ========================================

-- View for data processing inventory (Article 30)
CREATE OR REPLACE VIEW gdpr_processing_inventory AS
SELECT 
    pa.activity_name,
    pa.purpose,
    pa.legal_basis,
    pa.data_categories,
    pa.data_subjects,
    pa.recipients,
    pa.retention_period,
    pa.cross_border_transfers,
    COUNT(DISTINCT c.id) as affected_subjects_count,
    pa.created_at,
    pa.updated_at
FROM public.gdpr_processing_activities pa
LEFT JOIN public.clients c ON c.company_id IN (
    SELECT id FROM public.companies 
    WHERE id IN (
        SELECT company_id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
)
WHERE pa.is_active = true
GROUP BY pa.id, pa.activity_name, pa.purpose, pa.legal_basis, 
         pa.data_categories, pa.data_subjects, pa.recipients, 
         pa.retention_period, pa.cross_border_transfers, 
         pa.created_at, pa.updated_at;

-- View for consent overview
CREATE OR REPLACE VIEW gdpr_consent_overview AS
SELECT 
    cr.subject_email,
    cr.consent_type,
    cr.purpose,
    cr.consent_given,
    cr.consent_method,
    cr.created_at as consent_date,
    cr.withdrawn_at,
    cr.is_active,
    c.name as client_name
FROM public.gdpr_consent_records cr
LEFT JOIN public.clients c ON c.email = cr.subject_email
WHERE cr.company_id IN (
    SELECT company_id FROM public.users 
    WHERE auth_user_id = auth.uid()
)
ORDER BY cr.created_at DESC;

COMMIT;

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_gdpr_audit_log_user_id ON public.gdpr_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_log_table_record ON public.gdpr_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_log_subject_email ON public.gdpr_audit_log(subject_email);
CREATE INDEX IF NOT EXISTS idx_gdpr_audit_log_created_at ON public.gdpr_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gdpr_access_requests_email ON public.gdpr_access_requests(subject_email);
CREATE INDEX IF NOT EXISTS idx_gdpr_access_requests_status ON public.gdpr_access_requests(processing_status);
CREATE INDEX IF NOT EXISTS idx_gdpr_access_requests_deadline ON public.gdpr_access_requests(deadline_date);

CREATE INDEX IF NOT EXISTS idx_gdpr_consent_records_email ON public.gdpr_consent_records(subject_email);
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_records_type ON public.gdpr_consent_records(consent_type);
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_records_active ON public.gdpr_consent_records(is_active);

CREATE INDEX IF NOT EXISTS idx_clients_marketing_consent ON public.clients(marketing_consent);
CREATE INDEX IF NOT EXISTS idx_clients_retention_until ON public.clients(data_retention_until);
CREATE INDEX IF NOT EXISTS idx_clients_last_accessed ON public.clients(last_accessed_at);
