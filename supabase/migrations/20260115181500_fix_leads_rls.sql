-- Fix RLS policies for leads table to correctly map auth.uid() to public.users.id

-- Drop old policies
DROP POLICY IF EXISTS "Leads are viewable by company members" ON leads;
DROP POLICY IF EXISTS "Leads are inserted by company members or service role" ON leads;
DROP POLICY IF EXISTS "Leads are editable by company members" ON leads;
DROP POLICY IF EXISTS "Leads are deletable by company owner only" ON leads;

-- Create new policies
CREATE POLICY "Leads are viewable by company members" ON leads
    FOR SELECT USING (
        exists (
            select 1 from public.company_members cm
            join public.users u on u.id = cm.user_id
            where cm.company_id = leads.company_id
            and u.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Leads are inserted by company members or service role" ON leads
    FOR INSERT WITH CHECK (
        (
            exists (
                select 1 from public.company_members cm
                join public.users u on u.id = cm.user_id
                where cm.company_id = leads.company_id
                and u.auth_user_id = auth.uid()
            )
        )
        OR 
        (auth.role() = 'service_role') -- Allow webhooks
    );

CREATE POLICY "Leads are editable by company members" ON leads
    FOR UPDATE USING (
        exists (
            select 1 from public.company_members cm
            join public.users u on u.id = cm.user_id
            where cm.company_id = leads.company_id
            and u.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Leads are deletable by company owner only" ON leads
    FOR DELETE USING (
         exists (
            select 1 from public.company_members cm
            join public.users u on u.id = cm.user_id
            where cm.company_id = leads.company_id
            and u.auth_user_id = auth.uid()
            and cm.role = 'owner'
        )
    );
