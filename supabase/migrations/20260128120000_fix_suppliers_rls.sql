-- Fix RLS policy for suppliers table
-- Issue: The previous policy used LIMIT 1 which caused 403 errors if the user had multiple memberships or the default logic picked the wrong one.

DROP POLICY IF EXISTS "Users can manage their company suppliers" ON suppliers;

CREATE POLICY "Users can manage their company suppliers"
ON suppliers
FOR ALL
USING (
  company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id
    FROM company_members
    WHERE user_id = auth.uid()
  )
);
