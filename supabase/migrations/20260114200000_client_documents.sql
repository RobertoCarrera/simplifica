-- Create client_documents table
CREATE TABLE IF NOT EXISTS public.client_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for company members" ON public.client_documents
    FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Enable insert access for company members" ON public.client_documents
    FOR INSERT
    WITH CHECK (company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Enable delete access for company members" ON public.client_documents
    FOR DELETE
    USING (company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ));

-- Storage Bucket Setup (Attempt to create if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
-- We grant authenticated access to the bucket.
-- Application logic ensures users only see files via the `client_documents` table which acts as the index and is protected by RLS.
CREATE POLICY "Give users access to bucket Select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'client-documents');
CREATE POLICY "Give users access to bucket Insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-documents');
CREATE POLICY "Give users access to bucket Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'client-documents');
