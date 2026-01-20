-- Fix RLS policies for lead_sources to correctly map auth.uid() to public.users.id

DROP POLICY IF EXISTS "Enable read access for company members" ON public.lead_sources;
DROP POLICY IF EXISTS "Enable write access for company owners and admins" ON public.lead_sources;

CREATE POLICY "Enable read access for company members" ON public.lead_sources
    FOR SELECT
    USING (
      exists (
        select 1 from public.company_members cm
        join public.users u on u.id = cm.user_id
        where cm.company_id = public.lead_sources.company_id
        and u.auth_user_id = auth.uid()
      )
    );

CREATE POLICY "Enable write access for company owners and admins" ON public.lead_sources
    FOR ALL
    USING (
      exists (
        select 1 from public.company_members cm
        join public.users u on u.id = cm.user_id
        where cm.company_id = public.lead_sources.company_id
        and u.auth_user_id = auth.uid()
        and cm.role IN ('owner', 'admin')
      )
    );
