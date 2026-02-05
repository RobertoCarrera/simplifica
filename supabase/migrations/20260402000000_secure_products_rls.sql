-- Ensure RLS is enabled on products table
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

-- 1. View Policy
-- Allow company members to view products belonging to their company.
CREATE POLICY "Company members can view products"
ON "public"."products"
FOR SELECT
USING (
  company_id IN (
    SELECT company_id
    FROM public.company_members
    WHERE user_id = (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  )
);

-- 2. Management Policy
-- Allow Owners and Admins to Insert, Update, Delete products.
CREATE POLICY "Admins and Owners can manage products"
ON "public"."products"
FOR ALL
USING (
  company_id IN (
    SELECT company_id
    FROM public.company_members
    WHERE user_id = (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
    AND role IN ('owner', 'admin')
  )
);
