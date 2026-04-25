-- Migration: Create booking-documents storage bucket
-- Date: 2026-04-12
-- Reason: Storage bucket for booking document attachments

-- Storage bucket setup (wrapped to skip gracefully if storage schema unavailable during local reset)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
      'booking-documents',
      'booking-documents',
      false,
      10485760,
      ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  )
  ON CONFLICT (id) DO NOTHING;

  EXECUTE 'CREATE POLICY "Users can upload booking documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''booking-documents'' AND auth.uid() IS NOT NULL)';
  EXECUTE 'CREATE POLICY "Users can view booking documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''booking-documents'')';
  EXECUTE 'CREATE POLICY "Users can update booking documents" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''booking-documents'') WITH CHECK (bucket_id = ''booking-documents'' AND auth.uid() IS NOT NULL)';
  EXECUTE 'CREATE POLICY "Users can delete booking documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''booking-documents'' AND auth.uid() IS NOT NULL)';

  EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'booking_documents storage: skipped — %', SQLERRM;
END $$;
