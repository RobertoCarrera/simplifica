-- Migration to support Granular Consent Types (Health, Privacy, Marketing)
-- Aligns with GDPR Article 7 and Article 9 (Health Data)

-- 1. Update the check constraint or enum for consent_type
-- simplifying to text with check constraint for flexibility
ALTER TABLE public.gdpr_consent_records 
DROP CONSTRAINT IF EXISTS gdpr_consent_records_consent_type_check;

ALTER TABLE public.gdpr_consent_records
ADD CONSTRAINT gdpr_consent_records_consent_type_check 
CHECK (consent_type IN ('data_processing', 'marketing', 'health_data', 'privacy_policy', 'terms_of_service'));

-- 2. Add comment/description for health data sensitivity
COMMENT ON COLUMN public.gdpr_consent_records.consent_type IS 'Type of consent: privacy_policy (General), health_data (Sensitive/Art.9), marketing (Commercial)';

-- 3. Create a helper index for quick lookup of specific consent types per user
CREATE INDEX IF NOT EXISTS idx_gdpr_consents_subject_type 
ON public.gdpr_consent_records(subject_email, consent_type);

-- 4. (Optional) Backfill existing 'data_processing' to 'privacy_policy' if desired, 
-- but keeping 'data_processing' as legacy valid type is safer for now.
