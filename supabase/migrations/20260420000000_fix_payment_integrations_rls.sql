-- 20260420000000_fix_payment_integrations_rls.sql

-- MIGRACIÓN DE SEGURIDAD CRÍTICA: CORRECCIÓN DE CROSS-TENANT ACCESS Y LEGACY MAPPING
-- Objetivo: Corregir vulnerabilidades en `payment_integrations` y `verifactu_settings`
-- donde se permitía acceso cross-tenant o se dependía de la columna legacy `users.company_id`.

-- 1. PAYMENT INTEGRATIONS
-- Problema: La política anterior verificaba rol de admin pero NO el company_id.
-- Solución: Enforce estricto de pertenencia a la compañía mediante `company_members`.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- SELECT: Solo admins/owners activos de la MISMA compañía
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = payment_integrations.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
);

-- INSERT: Solo admins/owners activos de la MISMA compañía
CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = payment_integrations.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
);

-- UPDATE: Solo admins/owners activos de la MISMA compañía
CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = payment_integrations.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = payment_integrations.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
);

-- DELETE: Solo admins/owners activos de la MISMA compañía
CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = payment_integrations.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
);


-- 2. VERIFACTU SETTINGS
-- Problema: Usaba `users.company_id` (legacy).
-- Solución: Migrar a `company_members`.

DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = verifactu_settings.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
);

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = verifactu_settings.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
);

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = verifactu_settings.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = verifactu_settings.company_id
        AND cm.role IN ('owner', 'admin')
        AND cm.status = 'active'
    )
);

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = verifactu_settings.company_id
        AND cm.role IN ('owner', 'admin') -- Quizás owner solo? Dejemos owner/admin por consistencia con lo anterior
        AND cm.status = 'active'
    )
);
