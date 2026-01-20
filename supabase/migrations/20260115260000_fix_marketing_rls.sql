-- Fix RLS policies for marketing tables to correctly map auth.uid() to public.users.id

-- 1. Marketing Campaigns
DROP POLICY IF EXISTS "Enable all for company members" ON public.marketing_campaigns;

CREATE POLICY "Enable all for company members" ON public.marketing_campaigns
    FOR ALL
    USING (
        company_id IN (
            SELECT cm.company_id
            FROM public.company_members cm
            JOIN public.users u ON cm.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
        )
    );

-- 2. Marketing Logs
DROP POLICY IF EXISTS "Enable all for company members" ON public.marketing_logs;

CREATE POLICY "Enable all for company members" ON public.marketing_logs
    FOR ALL
    USING (
        campaign_id IN (
            SELECT id FROM public.marketing_campaigns 
            WHERE company_id IN (
                SELECT cm.company_id
                FROM public.company_members cm
                JOIN public.users u ON cm.user_id = u.id
                WHERE u.auth_user_id = auth.uid()
            )
        )
    );
