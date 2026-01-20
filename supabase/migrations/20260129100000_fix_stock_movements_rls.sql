-- Fix RLS policy for stock_movements
-- Fix Auth ID vs User ID mismatch by joining users table

DROP POLICY IF EXISTS "Users can create stock movements for their company" ON stock_movements;
DROP POLICY IF EXISTS "Users can view their company stock movements" ON stock_movements;

CREATE POLICY "Users can create stock movements for their company"
ON stock_movements
FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT cm.company_id
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Users can view their company stock movements"
ON stock_movements
FOR SELECT
USING (
  company_id IN (
    SELECT cm.company_id
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
  )
);
