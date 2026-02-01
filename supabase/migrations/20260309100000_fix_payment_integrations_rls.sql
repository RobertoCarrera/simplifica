DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'payment_integrations'
        AND column_name = 'company_id'
    ) THEN
        RAISE EXCEPTION 'Table payment_integrations is missing company_id column. Cannot apply RLS fix.';
    END IF;
END $$;

-- Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Create secure policies
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);
