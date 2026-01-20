-- Allow clients to insert their own consent records
CREATE POLICY "gdpr_consent_records_insert_client" ON "public"."gdpr_consent_records"
AS PERMISSIVE FOR INSERT
TO public
WITH CHECK (
  (auth.uid() = processed_by) AND 
  (EXISTS (
    SELECT 1 FROM public.client_portal_users cpu 
    WHERE cpu.email = subject_email 
    AND cpu.company_id = company_id
    AND cpu.is_active = true
  ))
);
