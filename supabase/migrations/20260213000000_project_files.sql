-- Create project_files table
CREATE TABLE IF NOT EXISTS public.project_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- Policies for project_files (Access based on project access would be ideal, but for now copying member logic)
-- A user can see files if they can see the project.
-- Use existing project RLS logic: 
-- 1. Super admins
-- 2. Company members where project.company_id = user.company_id
-- 3. Clients where project.client_id = user.id

CREATE POLICY "Enable read access for eligible users" ON public.project_files
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_files.project_id
            AND (
                -- Super Admin (simplified, assuming RLS bypass or handled elsewhere, but let's add specific check if needed)
                -- Owner/Admin/Employee of the company
                EXISTS (
                    SELECT 1 FROM public.company_members cm
                    WHERE cm.user_id = auth.uid()
                    AND cm.company_id = p.company_id
                )
                OR
                -- Client assigned to project
                (p.client_id IS NOT NULL AND (
                    SELECT c.auth_user_id FROM public.clients c WHERE c.id = p.client_id
                ) = auth.uid())
            )
        )
    );

CREATE POLICY "Enable insert access for team members" ON public.project_files
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_files.project_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id = auth.uid()
                AND cm.company_id = p.company_id
            )
        )
    );

CREATE POLICY "Enable delete access for team members" ON public.project_files
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_files.project_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id = auth.uid()
                AND cm.company_id = p.company_id
            )
        )
    );

-- Storage Bucket Setup
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
-- Allow authenticated users to upload/read if they have access to the table row logic (simplified to authenticated for bucket, strict on table)
-- Or better: 
CREATE POLICY "Give users access to bucket Select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-files');
CREATE POLICY "Give users access to bucket Insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-files');
CREATE POLICY "Give users access to bucket Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-files');
