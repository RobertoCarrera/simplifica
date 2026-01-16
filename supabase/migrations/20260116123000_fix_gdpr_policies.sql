-- Secure GDPR Consent Records Policies
-- 1. Create helper to safely identify Employees vs Clients
-- This avoids the "permission denied" error when clients try to read public.users directly in a policy.

CREATE OR REPLACE FUNCTION public.get_employee_company_id()
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Only return company_id if the user exists in public.users (Employees/Owners)
  -- Clients (public.clients) will return NULL, preventing access to general company records.
  RETURN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1);
END;
$$;

-- 2. Clean up broken/insecure policies
DROP POLICY IF EXISTS "gdpr_consent_records_company" ON public.gdpr_consent_records;
DROP POLICY IF EXISTS "gdpr_consent_records_company_only" ON public.gdpr_consent_records;

-- 3. Create Policy for EMPLOYEES (View All for their company)
DROP POLICY IF EXISTS "gdpr_consent_records_employee_select" ON public.gdpr_consent_records;
CREATE POLICY "gdpr_consent_records_employee_select" ON public.gdpr_consent_records
FOR SELECT
TO authenticated
USING (
  company_id = get_employee_company_id()
);

-- 4. Create Policy for EMPLOYEES (Insert/Update/Delete?)
DROP POLICY IF EXISTS "gdpr_consent_records_employee_all" ON public.gdpr_consent_records;
CREATE POLICY "gdpr_consent_records_employee_all" ON public.gdpr_consent_records
FOR ALL
TO authenticated
USING (
  company_id = get_employee_company_id()
)
WITH CHECK (
  company_id = get_employee_company_id()
);

-- 5. Ensure Client Policy is correct (View Own)
DROP POLICY IF EXISTS "Clients can view their own consent records" ON public.gdpr_consent_records;
CREATE POLICY "Clients can view their own consent records" ON public.gdpr_consent_records
FOR SELECT
TO authenticated
USING (
  subject_email = (select email from auth.users where id = auth.uid()) OR
  auth.uid() = processed_by
);

-- 6. Ensure Client Insert Policy
DROP POLICY IF EXISTS "gdpr_consent_records_insert_client" ON public.gdpr_consent_records;
CREATE POLICY "gdpr_consent_records_insert_client" ON public.gdpr_consent_records
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = processed_by 
  AND subject_email = (select email from auth.users where id = auth.uid())
);
