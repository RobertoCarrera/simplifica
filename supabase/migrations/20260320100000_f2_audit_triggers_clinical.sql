-- F2-1: Audit trigger for client_clinical_notes
-- RGPD Art. 32 – automatic audit trail for every access to health data
-- NOTE: We do NOT log old_values/new_values for clinical notes because
--       the content is AES-GCM ciphertext stored encrypted via Vault.
--       Logging ciphertext provides no value and would bloat the audit log.
--       We log WHO did WHAT to WHICH record, and WHEN.

CREATE OR REPLACE FUNCTION gdpr_audit_clinical_notes_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action  TEXT;
    v_user_id UUID;
    v_company_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_action     := 'create';
        v_company_id := (SELECT company_id FROM public.clients WHERE id = NEW.client_id LIMIT 1);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action     := 'update';
        v_company_id := (SELECT company_id FROM public.clients WHERE id = NEW.client_id LIMIT 1);
    ELSIF TG_OP = 'DELETE' THEN
        v_action     := 'delete';
        v_company_id := (SELECT company_id FROM public.clients WHERE id = OLD.client_id LIMIT 1);
    END IF;

    INSERT INTO public.gdpr_audit_log (
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        legal_basis,
        -- Deliberately omit old_values / new_values — content is encrypted
        user_id,
        company_id
    )
    SELECT
        v_action,
        'client_clinical_notes',
        COALESCE(NEW.id, OLD.id),
        c.email,
        'Clinical note ' || v_action,
        'legitimate_interest',
        v_user_id,
        v_company_id
    FROM public.clients c
    WHERE c.id = COALESCE(NEW.client_id, OLD.client_id)
    LIMIT 1;

    -- Always return the appropriate row so the DML succeeds
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- Drop if exists from any previous attempt, then recreate
DROP TRIGGER IF EXISTS gdpr_audit_clinical_notes_trigger
    ON public.client_clinical_notes;

CREATE TRIGGER gdpr_audit_clinical_notes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.client_clinical_notes
    FOR EACH ROW EXECUTE FUNCTION gdpr_audit_clinical_notes_changes();
