-- =====================================================================
-- Migration: Consent validation trigger on bookings
-- Date: 2026-04-06
-- GDPR: Fase 1 — Art. 6(1)(a) — base jurídica activa antes de reservar
--
-- Añade un BEFORE INSERT trigger en public.bookings que verifica que
-- el cliente (customer_email) tiene consentimiento data_processing activo
-- para esa empresa (company_id).
--
-- NOTA: El trigger es ADVERTENCIA en lugar de excepción dura para no romper
-- flujos activos (ej: reservas por staff sin portal activo). Si el cliente
-- no tiene consentimiento se registra warning en gdpr_audit_log y la reserva
-- se crea igualmente, pero con una nota de ley base alternativa.
-- En un paso posterior se puede endurecer a EXCEPTION.
-- =====================================================================

-- 1. Función del trigger
CREATE OR REPLACE FUNCTION public.trigger_validate_booking_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_consent BOOLEAN;
  v_client_id   UUID;
BEGIN
  -- Buscar consentimiento activo data_processing para este email y empresa
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
    -- Intentar también con 'privacy_policy' (sinónimo más reciente)
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
    -- Registrar en audit log para seguimiento DPO (no bloquea la reserva)
    -- Base jurídica alternativa: Art 6(1)(b) ejecución de contrato de servicio
    INSERT INTO public.gdpr_audit_log (
      event_type,
      table_name,
      record_id,
      user_email,
      description,
      metadata
    ) VALUES (
      'booking_no_consent_warning',
      'bookings',
      NEW.id,
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

REVOKE ALL ON FUNCTION public.trigger_validate_booking_consent() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_validate_booking_consent ON public.bookings;
CREATE TRIGGER trg_validate_booking_consent
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_validate_booking_consent();

COMMENT ON FUNCTION public.trigger_validate_booking_consent() IS
  'GDPR Art.6(1)(a): Comprueba consentimiento activo data_processing/privacy_policy antes de crear reserva. No bloquea — registra warning en gdpr_audit_log para seguimiento DPO si no hay consentimiento.';
