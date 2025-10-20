-- Add is_opened flag to tickets and index it for faster filtering/lists
DO $$ BEGIN
  ALTER TABLE IF EXISTS tickets
    ADD COLUMN IF NOT EXISTS is_opened boolean NOT NULL DEFAULT false;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table tickets does not exist yet; skipping is_opened addition.';
END $$;

-- Optional: backfill rule could be added here if needed

-- Index to speed up queries filtering by unread/opened status
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_tickets_is_opened ON tickets(is_opened);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Table tickets does not exist yet; skipping index creation.';
END $$;
