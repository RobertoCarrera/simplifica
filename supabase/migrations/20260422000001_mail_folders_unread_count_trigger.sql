-- Add unread_count column if it doesn't exist
ALTER TABLE mail_folders
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

-- Auto-update mail_folders.unread_count when mail_messages change
-- Triggered on INSERT, DELETE, and UPDATE of is_read or folder_id

CREATE OR REPLACE FUNCTION update_mail_folder_unread_count()
RETURNS TRIGGER AS $$
DECLARE
  affected_folder_id UUID;
  old_folder_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_folder_id := OLD.folder_id;
  ELSIF TG_OP = 'INSERT' THEN
    affected_folder_id := NEW.folder_id;
  ELSE
    -- UPDATE: check if folder_id or is_read changed
    IF OLD.folder_id IS DISTINCT FROM NEW.folder_id THEN
      -- Message moved between folders: update old folder too
      old_folder_id := OLD.folder_id;
      affected_folder_id := NEW.folder_id;
    ELSIF OLD.is_read IS DISTINCT FROM NEW.is_read THEN
      affected_folder_id := NEW.folder_id;
    ELSE
      -- Nothing relevant changed
      RETURN NEW;
    END IF;
  END IF;

  -- Update the affected folder's unread count
  IF affected_folder_id IS NOT NULL THEN
    UPDATE mail_folders
    SET unread_count = (
      SELECT COUNT(*)
      FROM mail_messages
      WHERE folder_id = affected_folder_id AND is_read = false
    )
    WHERE id = affected_folder_id;
  END IF;

  -- If message was moved, also update the old folder
  IF old_folder_id IS NOT NULL THEN
    UPDATE mail_folders
    SET unread_count = (
      SELECT COUNT(*)
      FROM mail_messages
      WHERE folder_id = old_folder_id AND is_read = false
    )
    WHERE id = old_folder_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS mail_messages_update_unread_count ON mail_messages;

CREATE TRIGGER mail_messages_update_unread_count
AFTER INSERT OR UPDATE OF is_read, folder_id OR DELETE
ON mail_messages
FOR EACH ROW
EXECUTE FUNCTION update_mail_folder_unread_count();

-- Backfill current unread counts to fix any stale data
UPDATE mail_folders mf
SET unread_count = (
  SELECT COUNT(*)
  FROM mail_messages mm
  WHERE mm.folder_id = mf.id AND mm.is_read = false
);
