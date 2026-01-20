-- Migration: Create Storage Bucket for HR Documents

-- 1. Create a new storage bucket 'hr-documents'
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'hr-documents', 
    'hr-documents', 
    FALSE, -- Private bucket
    FALSE,
    10485760, -- 10MB limit
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
) ON CONFLICT (id) DO NOTHING;

-- 2. Set up RLS policies for storage.objects

-- Policy: Admin/Owner can do ANYTHING in this bucket
CREATE POLICY "hr_docs_admin_all" ON storage.objects
FOR ALL USING (
    bucket_id = 'hr-documents'
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        -- Note: Storage paths ideally follow {company_id}/{employee_id}/...
        -- So we can check if the path starts with the company_id where user is admin
        AND (storage.foldername(name))[1]::uuid = cm.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin')
    )
);

-- Policy: Employees can VIEW their own documents
CREATE POLICY "hr_docs_employee_view" ON storage.objects
FOR SELECT USING (
    bucket_id = 'hr-documents'
    AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
        -- Check if path matches their employee ID (assumed path structure: company_id/employee_id/filename)
        AND (storage.foldername(name))[2]::uuid = e.id
    )
);
