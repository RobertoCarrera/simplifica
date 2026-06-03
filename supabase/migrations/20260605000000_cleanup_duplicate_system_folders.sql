-- Migration: Clean up duplicate system folders (no slash prefix vs slash prefix)
-- Root cause: An older function `initialize_mail_account_folders` created system folders
-- with paths like 'INBOX', 'Sent', 'Drafts', 'Trash', 'Spam' (no leading slash).
-- The newer `create_mail_system_folders` creates paths like '/Inbox', '/Sent', etc.
-- Since UNIQUE(account_id, path) considers these distinct, both sets coexist,
-- causing every folder to appear twice in the webmail sidebar.
--
-- This migration:
--   1. Moves messages from no-slash folders to their slash-prefixed counterparts
--   2. Deletes the no-slash duplicate rows
--   3. Drops the stale `initialize_mail_account_folders` function (its trigger is already gone)
BEGIN;

-- =============================================================================
-- 1. Move messages from no-slash folders to slash-prefixed counterparts
-- =============================================================================
WITH mapping AS (
  SELECT
    bad.id AS bad_id,
    good.id AS good_id
  FROM public.mail_folders bad
  JOIN public.mail_folders good
    ON good.account_id = bad.account_id
   AND good.system_role = bad.system_role
   AND good.path LIKE '/%'         -- slash-prefixed = correct
   AND good.type = 'system'
  WHERE bad.type = 'system'
    AND bad.path NOT LIKE '/%'     -- no-slash = duplicate to remove
    AND lower(bad.name) = lower(good.name)
)
UPDATE public.mail_messages mm
SET folder_id = m.good_id,
    updated_at = now()
FROM mapping m
WHERE mm.folder_id = m.bad_id;

-- =============================================================================
-- 2. Delete the no-slash duplicate system folders
-- =============================================================================
DELETE FROM public.mail_folders
WHERE type = 'system'
  AND path NOT LIKE '/%'
  AND system_role IN ('inbox', 'sent', 'drafts', 'trash', 'spam');

-- =============================================================================
-- 3. Drop the stale function that created the duplicates
--    (its trigger trigger_init_mail_folders was already removed)
-- =============================================================================
DROP FUNCTION IF EXISTS public.initialize_mail_account_folders(UUID);
DROP FUNCTION IF EXISTS public.trigger_init_mail_folders();

-- =============================================================================
-- 4. Notify PostgREST to refresh cache
-- =============================================================================
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
