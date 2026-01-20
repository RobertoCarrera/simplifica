-- Migration: Sync GDPR Consent to Clients table
-- Purpose: Ensure that when a user accepts marketing consent in GDPR records, 
-- the 'marketing_consent' flag in 'clients' table is updated, enabling automation.

-- 1. Create or Replace Sync Function
CREATE OR REPLACE FUNCTION public.sync_gdpr_to_client_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Check if this is a Marketing consent record
  -- We check consent_type 'marketing' OR purpose containing 'marketing'
  IF NEW.consent_type = 'marketing' OR NEW.purpose ILIKE '%marketing%' THEN
    
    -- Update matching client(s)
    UPDATE public.clients
    SET marketing_consent = NEW.consent_given,
        updated_at = now()
    WHERE email = NEW.subject_email 
      AND company_id = NEW.company_id;
      
    -- Note: If multiple clients with same email, all get updated. Correct.
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Create Trigger
DROP TRIGGER IF EXISTS on_gdpr_consent_sync_client ON public.gdpr_consent_records;

CREATE TRIGGER on_gdpr_consent_sync_client
  AFTER INSERT OR UPDATE ON public.gdpr_consent_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_gdpr_to_client_consent();
