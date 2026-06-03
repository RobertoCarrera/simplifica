-- Add supervisor to company_filter_visibility write policy
BEGIN;

DROP POLICY IF EXISTS "company_filter_visibility_write" ON public.company_filter_visibility;
CREATE POLICY "company_filter_visibility_write" ON public.company_filter_visibility
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = company_filter_visibility.company_id
        AND cm.status = 'active'
        AND ar.name IN ('supervisor', 'owner', 'super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = company_filter_visibility.company_id
        AND cm.status = 'active'
        AND ar.name IN ('supervisor', 'owner', 'super_admin', 'admin')
    )
  );

COMMIT;
