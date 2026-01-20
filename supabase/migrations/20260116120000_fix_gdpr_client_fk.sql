-- Fix Foreign Key on gdpr_consent_records.processed_by to allow Clients (auth.users)

-- 1. Explicitly drop the constraint if it exists (by name)
ALTER TABLE public.gdpr_consent_records 
DROP CONSTRAINT IF EXISTS gdpr_consent_records_processed_by_fkey;

-- 2. Try to drop any other potential FK on this column (legacy name)
DO $$ 
DECLARE 
    constraint_name text;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_catalog.pg_constraint con
    INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
    INNER JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE nsp.nspname = 'public'
    AND rel.relname = 'gdpr_consent_records'
    AND att.attname = 'processed_by'
    AND con.contype = 'f';

    IF constraint_name IS NOT NULL AND constraint_name != 'gdpr_consent_records_processed_by_fkey' THEN
        EXECUTE 'ALTER TABLE public.gdpr_consent_records DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

-- 3. Add new FK to auth.users
ALTER TABLE public.gdpr_consent_records
ADD CONSTRAINT gdpr_consent_records_processed_by_fkey
FOREIGN KEY (processed_by)
REFERENCES auth.users(id)
ON DELETE SET NULL;

-- Ensure RLS allows clients to see their own records (if not already)
DROP POLICY IF EXISTS "Clients can view their own consent records" ON public.gdpr_consent_records;
CREATE POLICY "Clients can view their own consent records" ON public.gdpr_consent_records
FOR SELECT
TO public
USING (
  subject_email = (select email from auth.users where id = auth.uid()) OR
  auth.uid() = processed_by
);
