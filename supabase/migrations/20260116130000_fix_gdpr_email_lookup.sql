-- Fix GDPR Policies to avoid querying auth.users directly
-- Accessing auth.users from a Policy (User Context) is not allowed for 'authenticated' role.
-- We must use auth.jwt() ->> 'email' instead.

-- 1. Update "Clients can view their own consent records"
DROP POLICY IF EXISTS "Clients can view their own consent records" ON public.gdpr_consent_records;
CREATE POLICY "Clients can view their own consent records" ON public.gdpr_consent_records
FOR SELECT
TO authenticated
USING (
  -- Compare subject_email with Email from JWT
  subject_email = (auth.jwt() ->> 'email') OR
  auth.uid() = processed_by
);

-- 2. Update "gdpr_consent_records_insert_client"
DROP POLICY IF EXISTS "gdpr_consent_records_insert_client" ON public.gdpr_consent_records;
CREATE POLICY "gdpr_consent_records_insert_client" ON public.gdpr_consent_records
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = processed_by 
  -- Verify the email matches the JWT email
  AND subject_email = (auth.jwt() ->> 'email')
);
