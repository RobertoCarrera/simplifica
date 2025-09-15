-- Ensure `ticket_comments` supports PostgREST embedding and robust integrity.
-- This migration is idempotent and safe to run multiple times.

DO $$
BEGIN
  -- Add a second FK so PostgREST can infer relationship to public.users for
  -- embeds like `user:users(name,email)`. We reference users.auth_user_id,
  -- which is UNIQUE and points to auth.users(id).
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'ticket_comments'
      AND tc.constraint_name = 'ticket_comments_user_id_fkey_public'
  ) THEN
    ALTER TABLE public.ticket_comments
      ADD CONSTRAINT ticket_comments_user_id_fkey_public
      FOREIGN KEY (user_id) REFERENCES public.users(auth_user_id) ON DELETE CASCADE;
  END IF;

  -- Replace legacy trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_ticket_comments_set_company'
      AND tgrelid = 'public.ticket_comments'::regclass
  ) THEN
    DROP TRIGGER trg_ticket_comments_set_company ON public.ticket_comments;
    -- Drop old function if present
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'fn_ticket_comments_set_company' AND n.nspname = 'public'
    ) THEN
      DROP FUNCTION public.fn_ticket_comments_set_company();
    END IF;
  END IF;

  -- Create the integrity function if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'fn_ticket_comments_maintain_integrity' AND n.nspname = 'public'
  ) THEN
    CREATE FUNCTION public.fn_ticket_comments_maintain_integrity()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      v_company uuid;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id THEN
          RAISE EXCEPTION 'ticket_id cannot be changed for a comment';
        END IF;
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
          RAISE EXCEPTION 'user_id cannot be changed for a comment';
        END IF;
      END IF;

      SELECT t.company_id INTO v_company FROM public.tickets t WHERE t.id = NEW.ticket_id;
      IF v_company IS NULL THEN
        RAISE EXCEPTION 'Invalid ticket reference on ticket_comments (ticket not found)';
      END IF;
      NEW.company_id := v_company;
      RETURN NEW;
    END;
    $$;
  END IF;

  -- Ensure the new trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_ticket_comments_maintain_integrity'
      AND tgrelid = 'public.ticket_comments'::regclass
  ) THEN
    CREATE TRIGGER trg_ticket_comments_maintain_integrity
      BEFORE INSERT OR UPDATE ON public.ticket_comments
      FOR EACH ROW EXECUTE FUNCTION public.fn_ticket_comments_maintain_integrity();
  END IF;

  -- Helpful index for author lookups/embeds
  CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id ON public.ticket_comments(user_id);
END $$;

COMMENT ON CONSTRAINT ticket_comments_user_id_fkey_public ON public.ticket_comments IS
  'Allows PostgREST to embed public.users via user_id -> users.auth_user_id (unique), while preserving auth.users FK semantics.';
