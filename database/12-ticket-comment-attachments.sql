-- Ticket Comment Attachments Linking Table
-- Creates a relation between ticket comments and attachments uploaded to Storage

BEGIN;

CREATE TABLE IF NOT EXISTS public.ticket_comment_attachments (
  comment_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  linked_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ticket_comment_attachments_pkey PRIMARY KEY (comment_id, attachment_id),
  CONSTRAINT ticket_comment_attachments_comment_id_fkey FOREIGN KEY (comment_id)
    REFERENCES public.ticket_comments(id) ON DELETE CASCADE,
  CONSTRAINT ticket_comment_attachments_attachment_id_fkey FOREIGN KEY (attachment_id)
    REFERENCES public.attachments(id) ON DELETE CASCADE
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_tca_comment ON public.ticket_comment_attachments (comment_id);
CREATE INDEX IF NOT EXISTS idx_tca_attachment ON public.ticket_comment_attachments (attachment_id);

COMMENT ON TABLE public.ticket_comment_attachments IS 'Link table between ticket_comments and attachments';

-- Optional RLS policies (uncomment and adapt if RLS is enabled on this project)
-- ALTER TABLE public.ticket_comment_attachments ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow read to related comments" ON public.ticket_comment_attachments
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM public.ticket_comments c
--       WHERE c.id = ticket_comment_attachments.comment_id
--     )
--   );
-- CREATE POLICY "Allow insert for users who can insert comments" ON public.ticket_comment_attachments
--   FOR INSERT WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.ticket_comments c
--       WHERE c.id = ticket_comment_attachments.comment_id
--     )
--   );

COMMIT;
