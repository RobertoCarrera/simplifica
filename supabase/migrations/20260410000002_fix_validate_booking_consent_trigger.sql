-- Fix trigger_validate_booking_consent: wrong column names in gdpr_audit_log INSERT.
-- Affected columns: event_type→action_type, user_email→subject_email,
--                   description→purpose, metadata→new_values.
-- Also adds a NULL email guard so DocPlanner bookings without an email skip the check.

CREATE OR REPLACE FUNCTION public.trigger_validate_booking_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_consent BOOLEAN;
BEGIN
  -- DocPlanner and other external sources may not provide an email — skip consent check
  IF NEW.customer_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look for active data_processing consent
  SELECT EXISTS (
    SELECT 1
    FROM public.gdpr_consent_records
    WHERE subject_email = NEW.customer_email
      AND company_id    = NEW.company_id
      AND consent_type  = 'data_processing'
      AND consent_given = true
      AND withdrawn_at  IS NULL
  ) INTO v_has_consent;

  IF NOT v_has_consent THEN
    -- Also accept 'privacy_policy' (newer synonym)
    SELECT EXISTS (
      SELECT 1
      FROM public.gdpr_consent_records
      WHERE subject_email = NEW.customer_email
        AND company_id    = NEW.company_id
        AND consent_type  = 'privacy_policy'
        AND consent_given = true
        AND withdrawn_at  IS NULL
    ) INTO v_has_consent;
  END IF;

  IF NOT v_has_consent THEN
    -- Audit warning for DPO — does NOT block the booking
    -- Legal basis: Art 6(1)(b) performance of contract
    INSERT INTO public.gdpr_audit_log (
      action_type,
      table_name,
      record_id,
      company_id,
      subject_email,
      purpose,
      new_values
    ) VALUES (
      'booking_no_consent_warning',
      'bookings',
      NEW.id,
      NEW.company_id,
      NEW.customer_email,
      'Booking created without active data_processing or privacy_policy consent — legal basis: Art 6(1)(b) performance of contract',
      jsonb_build_object(
        'customer_email', NEW.customer_email,
        'company_id',     NEW.company_id,
        'booking_at',     NOW(),
        'legal_basis',    'Art 6(1)(b)'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
