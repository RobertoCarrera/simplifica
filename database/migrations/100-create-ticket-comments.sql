-- Create ticket_comments table with multitenant-friendly columns and RLS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'ticket_comments'
  ) THEN
    CREATE TABLE public.ticket_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
      user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
      comment text NOT NULL,
      is_internal boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      company_id uuid NOT NULL REFERENCES public.companies(id)
    );

    -- Derive company_id from ticket for convenience and policy checks
    CREATE OR REPLACE FUNCTION public.fn_ticket_comments_maintain_integrity()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      v_company uuid;
    BEGIN
      -- Prevent changing immutable fields by regular updates
      IF TG_OP = 'UPDATE' THEN
        IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id THEN
          RAISE EXCEPTION 'ticket_id cannot be changed for a comment';
        END IF;
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
          RAISE EXCEPTION 'user_id cannot be changed for a comment';
        END IF;
      END IF;

      -- Always derive and enforce company_id from the ticket
      SELECT t.company_id INTO v_company FROM public.tickets t WHERE t.id = NEW.ticket_id;
      IF v_company IS NULL THEN
        RAISE EXCEPTION 'Invalid ticket reference on ticket_comments (ticket not found)';
      END IF;
      NEW.company_id := v_company;

      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER trg_ticket_comments_maintain_integrity
      BEFORE INSERT OR UPDATE ON public.ticket_comments
      FOR EACH ROW EXECUTE FUNCTION public.fn_ticket_comments_maintain_integrity();

    CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_comments_company_id ON public.ticket_comments(company_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_comments_created_at ON public.ticket_comments(created_at);

    ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

    -- Policies: users can see comments for tickets in their companies
    CREATE POLICY "Comments selectable by company members" ON public.ticket_comments
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id = ticket_comments.company_id
            AND u.active = TRUE
        )
      );

    -- Insert only if user belongs to company and is author; company matches ticket
    CREATE POLICY "Comments insert by company members" ON public.ticket_comments
      FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND company_id = (
          SELECT t2.company_id FROM public.tickets t2 WHERE t2.id = ticket_comments.ticket_id
        )
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id = company_id
            AND u.active = TRUE
        )
      );

    -- Optional: allow authors to delete or update their own comments in company scope
    CREATE POLICY "Comments update by author" ON public.ticket_comments
      FOR UPDATE USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id = ticket_comments.company_id
            AND u.active = TRUE
        )
      ) WITH CHECK (
        user_id = auth.uid()
        AND company_id = (
          SELECT t.company_id FROM public.tickets t WHERE t.id = ticket_comments.ticket_id
        )
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id = ticket_comments.company_id
            AND u.active = TRUE
        )
      );

    CREATE POLICY "Comments delete by author" ON public.ticket_comments
      FOR DELETE USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id = ticket_comments.company_id
            AND u.active = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.ticket_comments IS 'Comments for tickets with multitenant RLS and author constraints';
