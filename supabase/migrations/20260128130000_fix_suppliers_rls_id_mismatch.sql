-- Fix RLS policy for suppliers table to handle auth_user_id vs public.users.id mismatch
-- The previous policy assumed company_members.user_id matches auth.uid(), but it actually matches public.users.id

DROP POLICY IF EXISTS "Users can manage their company suppliers" ON suppliers;

CREATE POLICY "Users can manage their company suppliers"
ON suppliers
FOR ALL
USING (
  company_id IN (
    SELECT cm.company_id
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT cm.company_id
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
  )
);
