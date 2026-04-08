-- Tighten storage RLS for booking-documents bucket
-- The previous policy allowed ANY authenticated user to generate signed URLs for ANY file.
-- This replaces it with a policy that scopes access to active company members only.

DROP POLICY IF EXISTS "Users can view booking documents" ON storage.objects;

CREATE POLICY "Company members can view booking documents"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'booking-documents'
    AND EXISTS (
        SELECT 1 FROM public.booking_documents bd
        JOIN public.bookings b   ON bd.booking_id  = b.id
        JOIN public.clients c    ON b.client_id    = c.id
        JOIN public.company_members cm ON c.company_id = cm.company_id
        JOIN public.users u      ON cm.user_id     = u.id
        WHERE storage.objects.name = bd.file_path
          AND u.auth_user_id = auth.uid()
          AND cm.status = 'active'
    )
);
