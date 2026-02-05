-- Fix Critical RLS Issues on payment_integrations and verifactu_settings
-- Secure sensitive tables against Cross-Tenant Access and Public Access

-- 1. Enable RLS explicitly (Idempotent)
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifactu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifactu_cert_history ENABLE ROW LEVEL SECURITY;

-- 2. Drop insecure policies (TO public / Missing company check)

-- payment_integrations
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- verifactu_settings
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

-- verifactu_cert_history
DROP POLICY IF EXISTS "verifactu_cert_history_select_policy" ON public.verifactu_cert_history;

-- 3. Create SECURE policies (TO authenticated, Using company_members)

-- 3.1 Payment Integrations Policies
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = payment_integrations.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = payment_integrations.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = payment_integrations.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = payment_integrations.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = payment_integrations.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);

-- 3.2 Verifactu Settings Policies

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.role = 'owner'
          AND cm.status = 'active'
    )
);

-- 3.3 Verifactu Cert History Policies

CREATE POLICY "verifactu_cert_history_select_policy" ON public.verifactu_cert_history
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_cert_history.company_id
          AND cm.role IN ('owner', 'admin', 'super_admin')
          AND cm.status = 'active'
    )
);
