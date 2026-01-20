-- Migration: 20260126190000_cleanup_tags.sql

-- Drop the redundant tables I created, in favor of the existing ecosystem (global_tags, tickets_tags)
DROP TABLE IF EXISTS public.ticket_tags;
DROP TABLE IF EXISTS public.tags;

-- Ensure tickets_tags exists and has correct foreign keys / RLS
CREATE TABLE IF NOT EXISTS public.tickets_tags (
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.global_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_id, tag_id)
);

ALTER TABLE public.tickets_tags ENABLE ROW LEVEL SECURITY;

-- Add RLS to tickets_tags (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tickets_tags' AND policyname = 'staff_manage_tickets_tags'
    ) THEN
        CREATE POLICY "staff_manage_tickets_tags" ON public.tickets_tags
        FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.tickets t
                JOIN public.users u ON u.company_id = t.company_id
                WHERE t.id = tickets_tags.ticket_id
                  AND u.auth_user_id = auth.uid()
                  AND u.active = true
            )
        );
    END IF;
END $$;
