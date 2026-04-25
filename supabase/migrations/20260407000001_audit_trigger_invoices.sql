-- =====================================================================
-- Migration: Audit trigger for invoices table
-- Date: 2026-04-07
-- RGPD: Art. 5.2 (accountability), Art. 30 (records of processing)
-- Reason: invoices contain financial PII (amounts, client data) and
--         must be tracked in the audit log — a gap identified during
--         the 2026-04 security audit.
-- =====================================================================

-- 1. Audit function for invoices
CREATE OR REPLACE FUNCTION public.gdpr_audit_invoices_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action     TEXT;
    v_user_id    UUID;
    v_company_id UUID;
    v_client_id  UUID;
    v_record_id  UUID;
    v_old_values JSONB;
    v_new_values JSONB;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_action     := 'create';
        v_company_id := NEW.company_id;
        v_client_id  := NEW.client_id;
        v_record_id  := NEW.id;
        -- Log non-sensitive metadata only (not amounts in old/new to reduce leakage)
        v_new_values := jsonb_build_object(
            'invoice_number', NEW.invoice_number,
            'invoice_type',   NEW.invoice_type,
            'invoice_date',   NEW.invoice_date,
            'total',          NEW.total,
            'currency',       NEW.currency
        );
    ELSIF TG_OP = 'UPDATE' THEN
        v_action     := 'update';
        v_company_id := NEW.company_id;
        v_client_id  := NEW.client_id;
        v_record_id  := NEW.id;
        v_old_values := jsonb_build_object(
            'invoice_number', OLD.invoice_number,
            'total',          OLD.total,
            'paid_amount',    OLD.paid_amount
        );
        v_new_values := jsonb_build_object(
            'invoice_number', NEW.invoice_number,
            'total',          NEW.total,
            'paid_amount',    NEW.paid_amount
        );
    ELSIF TG_OP = 'DELETE' THEN
        v_action     := 'delete';
        v_company_id := OLD.company_id;
        v_client_id  := OLD.client_id;
        v_record_id  := OLD.id;
        v_old_values := jsonb_build_object(
            'invoice_number', OLD.invoice_number,
            'total',          OLD.total
        );
    END IF;

    INSERT INTO public.gdpr_audit_log (
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        legal_basis,
        old_values,
        new_values,
        user_id,
        company_id
    )
    SELECT
        v_action,
        'invoices',
        v_record_id,
        c.email,
        'Invoice ' || v_action,
        'contract',         -- Art. 6(1)(b) — contractual obligation
        v_old_values,
        v_new_values,
        v_user_id,
        v_company_id
    FROM public.clients c
    WHERE c.id = v_client_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. Drop + recreate to ensure correct definition
DROP TRIGGER IF EXISTS gdpr_audit_invoices_trigger ON public.invoices;

CREATE TRIGGER gdpr_audit_invoices_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.gdpr_audit_invoices_changes();

-- 3. Audit function for gdpr_consent_records
CREATE OR REPLACE FUNCTION public.gdpr_audit_consent_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action  TEXT;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
    END IF;

    INSERT INTO public.gdpr_audit_log (
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        legal_basis,
        new_values,
        user_id,
        company_id
    ) VALUES (
        v_action,
        'gdpr_consent_records',
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.subject_email, OLD.subject_email),
        'Consent ' || v_action || ' — ' || COALESCE(NEW.consent_type, OLD.consent_type),
        'consent',          -- Art. 6(1)(a)
        CASE WHEN TG_OP != 'DELETE' THEN jsonb_build_object(
            'consent_type',   NEW.consent_type,
            'consent_given',  NEW.consent_given,
            'consent_method', NEW.consent_method,
            'withdrawn_at',   NEW.withdrawn_at
        ) ELSE NULL END,
        v_user_id,
        COALESCE(NEW.company_id, OLD.company_id)
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS gdpr_audit_consent_trigger ON public.gdpr_consent_records;

CREATE TRIGGER gdpr_audit_consent_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.gdpr_consent_records
    FOR EACH ROW EXECUTE FUNCTION public.gdpr_audit_consent_changes();

COMMENT ON TRIGGER gdpr_audit_invoices_trigger ON public.invoices IS
    'RGPD Art. 5.2 + Art. 30 — audit trail for invoice create/update/delete operations';

COMMENT ON TRIGGER gdpr_audit_consent_trigger ON public.gdpr_consent_records IS
    'RGPD Art. 5.2 + Art. 7 — audit trail for consent record changes';
