-- Create mail-attachments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('mail-attachments', 'mail-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Public read (for now, or auth only)
-- Ideally authenticated only.
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'mail-attachments');
CREATE POLICY "Auth Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'mail-attachments' AND auth.role() = 'authenticated');
