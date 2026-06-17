-- Guard: prevent business_name from being set to a non-company descriptor
-- Bug history: an import populated clients.business_name with the value of
-- client_type ('Natural', 'Empresa', 'Particular', etc.) causing 426 of 910
-- clients to render their type instead of their name. Engram observation #1244.
--
-- This migration replaces a previous version that only raised a WARNING,
-- which let bad data through. The guard now raises an EXCEPTION (block),
-- normalizes case and whitespace, and also blocks business_name = client_type.

CREATE OR REPLACE FUNCTION public.trg_guard_clients_business_name()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_normalized text;
  v_blocklist text[] := ARRAY[
    'natural', 'empresa', 'particular',
    'self-employed', 'self employed', 'autonomo', 'autónomo',
    'persona', 'persona fisica', 'persona juridica',
    'persona física', 'persona jurídica', 'individual',
    'n/a', 'na', 'none', 'null', '-', '—'
  ];
BEGIN
  -- Only validate non-NULL values; NULL is the correct state for individuals.
  IF NEW.business_name IS NOT NULL THEN
    v_normalized := lower(btrim(NEW.business_name));

    -- 1. Blocklist match (case-insensitive, trimmed)
    IF v_normalized = ANY(v_blocklist) THEN
      RAISE EXCEPTION
        'business_name "%" is a non-company descriptor and is not allowed. '
        'Set it to NULL for individuals or to the real company name.',
        NEW.business_name
        USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Original bug: business_name copied from client_type
    IF NEW.client_type IS NOT NULL
       AND lower(btrim(NEW.business_name)) = lower(btrim(NEW.client_type)) THEN
      RAISE EXCEPTION
        'business_name equals client_type "%"; this matches the import bug '
        'we are guarding against. Set business_name to NULL for individuals.',
        NEW.client_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- search_path hardening (project convention; see 20260416001000_fix_seed_gdpr_trigger_search_path.sql)
ALTER FUNCTION public.trg_guard_clients_business_name() SET search_path = '';

-- Recreate trigger idempotently. Fire on any INSERT or UPDATE so the
-- client_type equality check still works even when client_type changes
-- without business_name changing.
DROP TRIGGER IF EXISTS trg_guard_clients_business_name ON public.clients;

CREATE TRIGGER trg_guard_clients_business_name
  BEFORE INSERT OR UPDATE OF business_name, client_type
  ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_clients_business_name();