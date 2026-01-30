-- Fix RLS for verifactu_settings to be more secure (TO authenticated) and use company_members

ALTER TABLE public.verifactu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = verifactu_settings.company_id
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
      AND cm.status = 'active'
      AND (cm.role = 'owner' OR cm.role = 'admin')
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
      AND cm.status = 'active'
      AND (cm.role = 'owner' OR cm.role = 'admin')
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
      AND cm.status = 'active'
      AND (cm.role = 'owner' OR cm.role = 'admin')
  )
);
