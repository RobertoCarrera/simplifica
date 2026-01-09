-- Migration to backfill 'anonymization' action_type in gdpr_audit_log
-- This corrects historical data where anonymizations were logged as 'update'

UPDATE public.gdpr_audit_log
SET action_type = 'anonymization',
    purpose = 'Historical Anonymization Fix'
WHERE table_name = 'clients'
  AND action_type = 'update'
  AND (
      new_values->>'name' = 'ANONYMIZED' 
      OR new_values->>'email' LIKE 'anonymized-%'
      OR (new_values->>'metadata')::jsonb->>'anonymized' = 'true'
  );
