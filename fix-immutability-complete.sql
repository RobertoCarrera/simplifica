-- ========================================================
-- FIX COMPLETO: Trigger de inmutabilidad de facturas
-- ========================================================
-- Este script añade TODOS los campos necesarios para que 
-- las actualizaciones de pago funcionen correctamente en
-- facturas finalizadas por Verifactu.
--
-- Campos añadidos a la lista permitida:
-- 1. updated_at - Se actualiza siempre en cualquier operación
-- 2. retention_until - Campo GENERADO, aparece como NULL en BEFORE trigger
-- 3. full_invoice_number - Campo GENERADO, aparece como NULL en BEFORE trigger
-- 4. payment_link_token - Token para links de pago
-- 5. payment_link_provider - Proveedor del link de pago
-- 6. payment_link_expires_at - Expiración del link
-- 7. stripe_payment_url/token - URLs de Stripe
-- 8. paypal_payment_url/token - URLs de PayPal
-- ========================================================

CREATE OR REPLACE FUNCTION public.invoices_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  old_values JSONB;
  new_values JSONB;
  diff_keys TEXT[];
  -- Campos que SIEMPRE se permiten actualizar (incluyendo campos generados que aparecen como NULL en BEFORE triggers)
  base_allowed_fields TEXT[] := ARRAY[
    'payment_status',
    'notes_internal', 
    'payment_method',
    'payment_reference',
    'paid_at',
    'due_date',
    'updated_at',
    -- Campos de enlaces de pago
    'stripe_payment_url',
    'stripe_payment_token',
    'paypal_payment_url',
    'paypal_payment_token',
    'payment_link_token',
    'payment_link_provider',
    'payment_link_expires_at',
    -- Campos GENERADOS (aparecen como NULL en BEFORE trigger, pero tienen valor en OLD)
    'retention_until',
    'full_invoice_number'
  ];
  allowed_fields TEXT[];
BEGIN
  -- Only block updates if invoice is finalized (Verifactu signed or official status)
  IF OLD.status NOT IN ('finalized', 'official') THEN
    RETURN NEW;
  END IF;

  -- Start with base allowed fields
  allowed_fields := base_allowed_fields;
  
  -- Allow rectification-related changes
  IF NEW.status IN ('rectified', 'void') THEN
    allowed_fields := allowed_fields || ARRAY['status', 'rectification_invoice_id', 'rectification_reason', 'rectification_type', 'rectified_at'];
  END IF;
  
  -- Build JSONB of old and new, EXCLUDING allowed fields
  old_values := to_jsonb(OLD);
  new_values := to_jsonb(NEW);
  
  -- Remove allowed fields from comparison
  FOR i IN 1..array_length(allowed_fields, 1) LOOP
    old_values := old_values - allowed_fields[i];
    new_values := new_values - allowed_fields[i];
  END LOOP;
  
  -- Find any remaining differences
  SELECT array_agg(key) INTO diff_keys
  FROM (
    SELECT key FROM jsonb_each(new_values) 
    EXCEPT 
    SELECT key FROM jsonb_each(old_values) WHERE old_values->key = new_values->key
  ) AS diffs;
  
  -- Check for actual value changes (not just key presence)
  IF diff_keys IS NOT NULL AND array_length(diff_keys, 1) > 0 THEN
    -- Check if any of the differing fields actually have different values
    FOR i IN 1..array_length(diff_keys, 1) LOOP
      IF new_values->diff_keys[i] IS DISTINCT FROM old_values->diff_keys[i] THEN
        RAISE EXCEPTION 'Invoice is finalized and immutable. Diff: New=% Old=%', 
          new_values, old_values
        USING HINT = 'Allowed: ' || array_to_string(allowed_fields, ', ');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- Verificar que el trigger existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'invoices_immutability_trigger' 
    AND tgrelid = 'public.invoices'::regclass
  ) THEN
    CREATE TRIGGER invoices_immutability_trigger
      BEFORE UPDATE ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.invoices_immutability_guard();
    RAISE NOTICE 'Trigger creado correctamente';
  ELSE
    RAISE NOTICE 'Trigger ya existe, función actualizada';
  END IF;
END $$;

-- Mensaje de confirmación
SELECT 'FIX APLICADO: El trigger ahora permite updated_at, retention_until y full_invoice_number' AS resultado;
