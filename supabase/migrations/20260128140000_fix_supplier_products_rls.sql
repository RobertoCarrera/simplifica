-- Fix RLS policy for supplier_products
-- 1. Fix Auth ID vs User ID mismatch by joining users table
-- 2. Fix potential multi-company issue by using IN instead of = LIMIT 1

DROP POLICY IF EXISTS "Users can manage their company supplier products" ON supplier_products;

CREATE POLICY "Users can manage their company supplier products"
ON supplier_products
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
