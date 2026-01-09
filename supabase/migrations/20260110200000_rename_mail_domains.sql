-- Rename table
ALTER TABLE public.mail_domains RENAME TO domains;

-- Rename index
ALTER INDEX IF EXISTS idx_mail_domains_assigned RENAME TO idx_domains_assigned;

-- Drop old policies (they are attached to the table name, but good to be explicit about intent or recreation if needed)
-- Note: When a table is renamed, policies usually travel with it, but their names might be confusing if they referenced "mail domains".
-- Let's update policy names for clarity.

DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage domains" ON public.domains;
DROP POLICY IF EXISTS "Users can insert assigned mail domains" ON public.domains;
DROP POLICY IF EXISTS "Users can update assigned mail domains" ON public.domains;
DROP POLICY IF EXISTS "Users can delete assigned mail domains" ON public.domains;

-- Re-create policies with new names (and referring to new table name implicitly)

CREATE POLICY "Authenticated users can view verified domains"
ON public.domains FOR SELECT
TO authenticated
USING (
  assigned_to_user = auth.uid() OR
  (is_verified = true AND EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.auth_user_id = auth.uid() 
      AND users.role = 'admin'
  ))
);

CREATE POLICY "Users can insert domains"
ON public.domains FOR INSERT
TO authenticated
WITH CHECK (
  assigned_to_user = auth.uid()
);

CREATE POLICY "Users can update own domains"
ON public.domains FOR UPDATE
TO authenticated
USING (assigned_to_user = auth.uid());

CREATE POLICY "Users can delete own domains"
ON public.domains FOR DELETE
TO authenticated
USING (assigned_to_user = auth.uid());

CREATE POLICY "Admins can manage all domains"
ON public.domains FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.auth_user_id = auth.uid()
    AND users.role = 'admin'
  )
);
