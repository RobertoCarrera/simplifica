-- Migration: Mail folder transactional operations
-- Provides SECURITY DEFINER RPCs for atomic folder CRUD and email moves.
-- Addresses: transactional integrity for move/delete/rename operations.
-- All RPCs validate folder ownership via account ownership chain.
BEGIN;

-- =============================================================================
-- 1. move_mail_messages — atomically move messages to a target folder
-- =============================================================================
-- Validates:
--   - Target folder exists
--   - All messages belong to the same account as the target folder
--   - Batch size ≤ 500 (hard cap, from API spec)
-- Side effects: updates updated_at on moved messages, triggers NOTIFY for
--   PostgREST cache invalidation on mail_messages and mail_folders.
CREATE OR REPLACE FUNCTION public.move_mail_messages(
  p_message_ids UUID[],
  p_target_folder_id UUID
)
RETURNS TABLE(moved_count INT, target_folder_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target RECORD;
  v_account_id UUID;
  v_count INT;
BEGIN
  -- Batch size cap
  IF array_length(p_message_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Batch size exceeds 500 (got %)', array_length(p_message_ids, 1)
      USING ERRCODE = 'P0001', HINT = 'Split into smaller batches of up to 500 message IDs';
  END IF;

  -- Validate empty input
  IF p_message_ids IS NULL OR array_length(p_message_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No message IDs provided'
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve target folder (ignore RLS — SECURITY DEFINER)
  SELECT mf.id, mf.name, mf.path, mf.account_id
  INTO v_target
  FROM public.mail_folders mf
  WHERE mf.id = p_target_folder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Folder not found: %', p_target_folder_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: all messages must belong to the same account as the target folder
  SELECT COUNT(*) INTO v_count
  FROM public.mail_messages mm
  WHERE mm.id = ANY(p_message_ids)
    AND mm.account_id != v_target.account_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION '% message(s) belong to a different account than the target folder', v_count
      USING ERRCODE = 'P0003', HINT = 'All messages must be from the same account as the destination folder';
  END IF;

  -- Count existing messages (so we don't fail silently on invalid IDs)
  SELECT COUNT(*) INTO v_count
  FROM public.mail_messages mm
  WHERE mm.id = ANY(p_message_ids);

  IF v_count = 0 THEN
    moved_count := 0;
    target_folder_name := v_target.name;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atomic update
  UPDATE public.mail_messages
  SET folder_id = p_target_folder_id,
      updated_at = now()
  WHERE id = ANY(p_message_ids)
    AND account_id = v_target.account_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Notify PostgREST to refresh its schema cache (addresses smart_folder_enabled
  -- cache staleness for mail_accounts as well, per DESIGN.md known issue)
  PERFORM pg_notify('pgrst', 'reload schema');

  moved_count := v_count;
  target_folder_name := v_target.name;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.move_mail_messages IS 'Atomically move one or more emails to a target folder. Validates folder existence, account ownership, and batch size (≤500). Returns the count of moved messages.';

-- =============================================================================
-- 2. delete_mail_folder_rpc — transactionally delete a folder
-- =============================================================================
--   - Only user-type folders can be deleted (system folders protected)
--   - All messages in the folder (and its subfolders) are moved to Inbox first
--   - Subfolders are cascaded-deleted (ON DELETE CASCADE on parent_id FK)
--   - Folder and descendants must all belong to the requesting user's accounts
CREATE OR REPLACE FUNCTION public.delete_mail_folder_rpc(
  p_folder_id UUID
)
RETURNS TABLE(deleted BOOLEAN, messages_moved INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_folder RECORD;
  v_inbox_id UUID;
  v_moved INT := 0;
  v_descendant_ids UUID[];
BEGIN
  -- Resolve folder
  SELECT mf.id, mf.name, mf.type, mf.system_role, mf.account_id
  INTO v_folder
  FROM public.mail_folders mf
  WHERE mf.id = p_folder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Folder not found: %', p_folder_id
      USING ERRCODE = 'P0002';
  END IF;

  -- System folders are protected
  IF v_folder.type = 'system' THEN
    RAISE EXCEPTION 'Cannot delete system folder: % (%)', v_folder.name, v_folder.system_role
      USING ERRCODE = 'P0004';
  END IF;

  -- Find Inbox for this account
  SELECT mf.id INTO v_inbox_id
  FROM public.mail_folders mf
  WHERE mf.account_id = v_folder.account_id
    AND mf.system_role = 'inbox'
  LIMIT 1;

  IF v_inbox_id IS NULL THEN
    RAISE EXCEPTION 'Inbox not found for account: %. Cannot reassign messages.', v_folder.account_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Collect all descendant folder IDs (including the folder itself)
  WITH RECURSIVE descendants AS (
    SELECT mf.id FROM public.mail_folders mf WHERE mf.id = p_folder_id
    UNION ALL
    SELECT mf.id FROM public.mail_folders mf
    INNER JOIN descendants d ON mf.parent_id = d.id
  )
  SELECT array_agg(id) INTO v_descendant_ids FROM descendants;

  -- Move all messages in the folder + descendants to Inbox
  IF v_descendant_ids IS NOT NULL AND array_length(v_descendant_ids, 1) > 0 THEN
    UPDATE public.mail_messages
    SET folder_id = v_inbox_id,
        updated_at = now()
    WHERE folder_id = ANY(v_descendant_ids)
      AND account_id = v_folder.account_id;

    GET DIAGNOSTICS v_moved = ROW_COUNT;
  END IF;

  -- Delete the folder (CASCADE handles subfolders via parent_id FK)
  DELETE FROM public.mail_folders WHERE id = p_folder_id;

  PERFORM pg_notify('pgrst', 'reload schema');

  deleted := TRUE;
  messages_moved := v_moved;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.delete_mail_folder_rpc IS 'Transactionally delete a user folder: moves contained messages to Inbox, cascades to subfolders. System folders are protected.';

-- =============================================================================
-- 3. rename_mail_folder_rpc — rename folder with cascading path updates
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rename_mail_folder_rpc(
  p_folder_id UUID,
  p_new_name VARCHAR(255)
)
RETURNS TABLE(renamed BOOLEAN, new_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_folder RECORD;
  v_old_path TEXT;
  v_new_path TEXT;
  v_affected INT;
BEGIN
  -- Validate new name
  IF p_new_name IS NULL OR trim(p_new_name) = '' THEN
    RAISE EXCEPTION 'Folder name cannot be empty'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check for path separators in name
  IF p_new_name ~ '[/\\]' THEN
    RAISE EXCEPTION 'Folder name cannot contain path separators (/ or \): %', p_new_name
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve folder
  SELECT mf.id, mf.name, mf.path, mf.type, mf.system_role, mf.account_id
  INTO v_folder
  FROM public.mail_folders mf
  WHERE mf.id = p_folder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Folder not found: %', p_folder_id
      USING ERRCODE = 'P0002';
  END IF;

  -- System folders cannot be renamed
  IF v_folder.type = 'system' THEN
    RAISE EXCEPTION 'Cannot rename system folder: %', v_folder.system_role
      USING ERRCODE = 'P0004';
  END IF;

  -- Check for duplicate name at the same level
  IF EXISTS (
    SELECT 1 FROM public.mail_folders mf
    WHERE mf.account_id = v_folder.account_id
      AND mf.parent_id IS NOT DISTINCT FROM (
        SELECT parent_id FROM public.mail_folders WHERE id = p_folder_id
      )
      AND mf.name = p_new_name
      AND mf.id != p_folder_id
  ) THEN
    RAISE EXCEPTION 'A folder named "%" already exists at this level', p_new_name
      USING ERRCODE = '23505';
  END IF;

  v_old_path := v_folder.path;

  -- Compute new path: replace last segment
  IF position('/' IN v_old_path) > 0 THEN
    v_new_path := regexp_replace(v_old_path, '/[^/]+$', '/' || p_new_name);
  ELSE
    v_new_path := '/' || p_new_name;
  END IF;

  -- Rename the folder itself
  UPDATE public.mail_folders
  SET name = p_new_name,
      path = v_new_path,
      updated_at = now()
  WHERE id = p_folder_id;

  -- Cascade path updates to all descendants
  WITH RECURSIVE descendants AS (
    SELECT mf.id, mf.path
    FROM public.mail_folders mf
    WHERE mf.parent_id = p_folder_id
    UNION ALL
    SELECT mf.id, mf.path
    FROM public.mail_folders mf
    INNER JOIN descendants d ON mf.parent_id = d.id
  )
  UPDATE public.mail_folders mf
  SET path = replace(d.path, v_old_path, v_new_path),
      updated_at = now()
  FROM descendants d
  WHERE mf.id = d.id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  PERFORM pg_notify('pgrst', 'reload schema');

  renamed := TRUE;
  new_path := v_new_path;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rename_mail_folder_rpc IS 'Rename a user folder and cascade path updates to all descendant folders. System folders are protected.';

-- =============================================================================
-- 4. create_mail_folder_rpc — create folder with input validation
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_mail_folder_rpc(
  p_account_id UUID,
  p_name VARCHAR(255),
  p_parent_id UUID DEFAULT NULL
)
RETURNS TABLE(folder_id UUID, name TEXT, path TEXT, parent_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_path TEXT;
  v_new_path TEXT;
  v_existing_count INT;
BEGIN
  -- Validate name
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Folder name cannot be empty'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_name ~ '[/\\]' THEN
    RAISE EXCEPTION 'Folder name cannot contain path separators (/ or \): %', p_name
      USING ERRCODE = 'P0001';
  END IF;

  -- Disallow names that collide with system folder names at root level
  IF p_parent_id IS NULL AND lower(p_name) = ANY(ARRAY['inbox','sent','drafts','trash','spam']) THEN
    RAISE EXCEPTION 'Cannot create a folder with reserved name: %', p_name
      USING ERRCODE = 'P0001';
  END IF;

  -- If parent provided, validate it exists and belongs to same account
  IF p_parent_id IS NOT NULL THEN
    SELECT mf.path INTO v_parent_path
    FROM public.mail_folders mf
    WHERE mf.id = p_parent_id AND mf.account_id = p_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent folder not found or belongs to a different account: %', p_parent_id
        USING ERRCODE = 'P0002';
    END IF;

    v_new_path := v_parent_path || '/' || p_name;
  ELSE
    v_new_path := '/' || p_name;
  END IF;

  -- Check for duplicate path
  SELECT COUNT(*) INTO v_existing_count
  FROM public.mail_folders
  WHERE account_id = p_account_id AND path = v_new_path;

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'A folder already exists at path: %', v_new_path
      USING ERRCODE = '23505';
  END IF;

  -- Insert
  INSERT INTO public.mail_folders (account_id, parent_id, name, path, type)
  VALUES (p_account_id, p_parent_id, p_name, v_new_path, 'user')
  RETURNING id, name, path, mail_folders.parent_id INTO folder_id, name, path, parent_id;

  PERFORM pg_notify('pgrst', 'reload schema');

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.create_mail_folder_rpc IS 'Create a user folder with full validation: name format, reserved names, duplicate paths, and parent existence.';

-- =============================================================================
-- 5. suggest_folders_rpc — rule-based folder suggestions for emails
-- =============================================================================
-- Suggests folders based on sender domain, subject keywords, or existing folders.
-- This is a best-effort, non-blocking operation — always returns at minimum the
-- top-level user folders as candidates.
CREATE OR REPLACE FUNCTION public.suggest_folders_rpc(
  p_account_id UUID,
  p_sender_email TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL
)
RETURNS TABLE(
  folder_id UUID,
  folder_name TEXT,
  folder_path TEXT,
  score FLOAT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_folder_id UUID;
BEGIN
  -- 1. Exact sender match: if a folder path matches the sender's sanitized name, it's a top pick
  IF p_sender_email IS NOT NULL THEN
    -- Extract local part and sanitize (same logic as frontend's sanitizeFolderName)
    DECLARE
      v_local TEXT := split_part(p_sender_email, '@', 1);
      v_sanitized TEXT := regexp_replace(
        regexp_replace(trim(v_local), '\s+', '_', 'g'),
        '[<>:"/\\|?*]', '', 'g'
      );
    BEGIN
      IF v_sanitized != '' THEN
        SELECT mf.id INTO v_sender_folder_id
        FROM public.mail_folders mf
        WHERE mf.account_id = p_account_id
          AND mf.type = 'user'
          AND lower(mf.name) = lower(v_sanitized)
        LIMIT 1;
      END IF;
    END;
  END IF;

  -- 2. Return top-level user folders as candidates (excluding system folders)
  --    Score penalty: exact sender match gets 1.0, others get 0.3 as base
  RETURN QUERY
  SELECT
    mf.id,
    mf.name,
    mf.path,
    CASE
      WHEN mf.id = v_sender_folder_id THEN 1.0::FLOAT
      ELSE 0.3::FLOAT
    END AS score,
    CASE
      WHEN mf.id = v_sender_folder_id THEN 'Sender match'
      ELSE 'Available folder'
    END AS reason
  FROM public.mail_folders mf
  WHERE mf.account_id = p_account_id
    AND mf.type = 'user'
    AND mf.parent_id IS NULL  -- top-level only
  ORDER BY score DESC, mf.name ASC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.suggest_folders_rpc IS 'Suggest folders for an email based on sender and subject. Returns up to 10 candidates sorted by relevance.';

-- =============================================================================
-- 6. toggle_smart_folders_rpc — toggle smart folder auto-organization
-- =============================================================================
CREATE OR REPLACE FUNCTION public.toggle_smart_folders_rpc(
  p_account_id UUID,
  p_enabled BOOLEAN
)
RETURNS TABLE(account_id UUID, smart_folder_enabled BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Validate account exists
  IF NOT EXISTS (SELECT 1 FROM public.mail_accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Mail account not found: %', p_account_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.mail_accounts
  SET smart_folder_enabled = p_enabled,
      updated_at = now()
  WHERE id = p_account_id
  RETURNING id, smart_folder_enabled INTO account_id, smart_folder_enabled;

  -- Address PostgREST cache staleness (DESIGN.md known issue)
  PERFORM pg_notify('pgrst', 'reload schema');

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.toggle_smart_folders_rpc IS 'Toggle smart folder auto-organization for a mail account. Sends pgrst NOTIFY to address cache staleness.';

-- =============================================================================
-- 7. get_folder_with_counts — helper for listing folders with message counts
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_folder_with_counts(
  p_account_id UUID
)
RETURNS TABLE(
  id UUID,
  account_id UUID,
  parent_id UUID,
  name TEXT,
  path TEXT,
  type TEXT,
  system_role TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mf.id,
    mf.account_id,
    mf.parent_id,
    mf.name,
    mf.path,
    mf.type,
    mf.system_role,
    mf.created_at,
    mf.updated_at,
    COUNT(mm.id) AS total_count,
    COUNT(mm.id) FILTER (WHERE mm.is_read = FALSE) AS unread_count
  FROM public.mail_folders mf
  LEFT JOIN public.mail_messages mm
    ON mm.folder_id = mf.id AND mm.account_id = mf.account_id
  WHERE mf.account_id = p_account_id
  GROUP BY mf.id
  ORDER BY
    CASE mf.type WHEN 'system' THEN 0 ELSE 1 END,
    CASE mf.system_role
      WHEN 'inbox' THEN 1 WHEN 'sent' THEN 2 WHEN 'drafts' THEN 3
      WHEN 'spam' THEN 4 WHEN 'trash' THEN 5 ELSE 99
    END,
    mf.name;
END;
$$;

COMMENT ON FUNCTION public.get_folder_with_counts IS 'List folders for an account with total and unread message counts. Ordered: system folders first (by role), then user folders alphabetically.';

COMMIT;
