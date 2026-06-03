-- Migration: Classification engine DB functions
-- Provides RPCs for similarity search and auto-filing support.
-- Complements the ClassificationEngine TypeScript module with DB-side queries.
BEGIN;

-- =============================================================================
-- 1. find_similar_emails_rpc — find emails similar to a trigger email
-- =============================================================================
-- Combines sender, domain, and subject keyword matching.
-- Returns candidate emails sorted by similarity score desc.
-- Best-effort: always returns empty set rather than error on missing data.
CREATE OR REPLACE FUNCTION public.find_similar_emails_rpc(
  p_account_id UUID,
  p_trigger_email_id UUID DEFAULT NULL,
  p_sender_email TEXT DEFAULT NULL,
  p_sender_domain TEXT DEFAULT NULL,
  p_subject_words TEXT[] DEFAULT NULL,  -- pre-tokenized subject words
  p_exclude_folder_ids UUID[] DEFAULT NULL,  -- folders to skip (e.g., Trash, Sent)
  p_max_results INT DEFAULT 50
)
RETURNS TABLE(
  message_id UUID,
  sender_name TEXT,
  sender_email TEXT,
  subject TEXT,
  is_starred BOOLEAN,
  folder_id UUID,
  score FLOAT,
  match_reasons TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trigger_subject TEXT;
  v_inbox_id UUID;
BEGIN
  -- Resolve the inbox (most candidates will be from inbox)
  SELECT mf.id INTO v_inbox_id
  FROM public.mail_folders mf
  WHERE mf.account_id = p_account_id
    AND mf.system_role = 'inbox'
  LIMIT 1;

  -- If we have a trigger email ID, fetch its subject for keyword matching
  IF p_trigger_email_id IS NOT NULL THEN
    SELECT mm.subject INTO v_trigger_subject
    FROM public.mail_messages mm
    WHERE mm.id = p_trigger_email_id AND mm.account_id = p_account_id;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      mm.id,
      COALESCE(mm.from->>'name', split_part(mm.from->>'email', '@', 1)) AS sender_name,
      mm.from->>'email' AS sender_email,
      split_part(mm.from->>'email', '@', 2) AS sender_domain,
      mm.subject,
      COALESCE(mm.is_starred, false) AS is_starred,
      mm.folder_id,
      -- Score components:
      -- 1. Exact sender match (weight: 1.0)
      (CASE
        WHEN p_sender_email IS NOT NULL
          AND lower(mm.from->>'email') = lower(p_sender_email)
        THEN 1.0
        ELSE 0.0
      END) AS sender_score,
      -- 2. Domain match (weight: 0.3)
      (CASE
        WHEN p_sender_domain IS NOT NULL
          AND lower(split_part(mm.from->>'email', '@', 2)) = lower(p_sender_domain)
          AND lower(mm.from->>'email') != lower(COALESCE(p_sender_email, ''))
        THEN 0.3
        ELSE 0.0
      END) AS domain_score,
      -- 3. Starred bonus (weight: 0.2)
      (CASE
        WHEN COALESCE(mm.is_starred, false) = true THEN 0.2
        ELSE 0.0
      END) AS starred_score
    FROM public.mail_messages mm
    WHERE mm.account_id = p_account_id
      AND mm.id != COALESCE(p_trigger_email_id, '00000000-0000-0000-0000-000000000000')
      -- Exclude messages in trash or sent folders
      AND (
        p_exclude_folder_ids IS NULL
        OR mm.folder_id != ALL(p_exclude_folder_ids)
      )
      -- Limit to inbox or user folders (skip system folders by default)
      AND (
        v_inbox_id IS NULL
        OR mm.folder_id = v_inbox_id
        OR EXISTS (
          SELECT 1 FROM public.mail_folders mf
          WHERE mf.id = mm.folder_id AND mf.type = 'user'
        )
      )
  )
  SELECT
    c.id,
    c.sender_name::TEXT,
    c.sender_email::TEXT,
    c.subject::TEXT,
    c.is_starred,
    c.folder_id,
    (c.sender_score + c.domain_score + c.starred_score)::FLOAT AS score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c.sender_score > 0 THEN 'Exact sender match' ELSE NULL END,
      CASE WHEN c.domain_score > 0 THEN 'Same domain' ELSE NULL END,
      CASE WHEN c.starred_score > 0 THEN 'Also starred' ELSE NULL END
    ], NULL) AS match_reasons
  FROM candidates c
  WHERE (c.sender_score + c.domain_score + c.starred_score) > 0
  ORDER BY score DESC, c.id
  LIMIT p_max_results;
END;
$$;

COMMENT ON FUNCTION public.find_similar_emails_rpc IS 'Find emails similar to a trigger email by sender, domain, and star status. Returns up to 50 candidates sorted by relevance. Best-effort, non-blocking.';

-- =============================================================================
-- 2. auto_file_starred_rpc — bulk auto-file when starring triggers folder creation
-- =============================================================================
-- When smart folders are enabled and a user stars an email:
--   1. Creates (or finds) a folder for the sender
--   2. Moves the starred email into that folder
--   3. Finds similar emails and optionally moves them too
-- All in one atomic transaction.
CREATE OR REPLACE FUNCTION public.auto_file_starred_rpc(
  p_message_id UUID,
  p_folder_name TEXT DEFAULT NULL,        -- optional: override sender-derived name
  p_move_similar BOOLEAN DEFAULT false,   -- whether to also move similar emails
  p_similar_threshold FLOAT DEFAULT 0.5   -- min score for similar emails (0-1)
)
RETURNS TABLE(
  folder_created BOOLEAN,
  folder_id UUID,
  folder_path TEXT,
  starred_email_moved BOOLEAN,
  similar_moved INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message RECORD;
  v_account_id UUID;
  v_folder_id UUID;
  v_folder_path TEXT;
  v_folder_created BOOLEAN := false;
  v_similar_count INT := 0;
  v_sender_name TEXT;
  v_sanitized_name TEXT;
  v_inbox_id UUID;
  v_trash_id UUID;
  v_sent_id UUID;
  v_exclude UUID[];
BEGIN
  -- Resolve the message
  SELECT mm.id, mm.account_id, mm.from, mm.is_starred, mm.folder_id
  INTO v_message
  FROM public.mail_messages mm
  WHERE mm.id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found: %', p_message_id
      USING ERRCODE = 'P0002';
  END IF;

  v_account_id := v_message.account_id;

  -- Only proceed if starred
  IF NOT COALESCE(v_message.is_starred, false) THEN
    folder_created := false;
    folder_id := NULL;
    folder_path := NULL;
    starred_email_moved := false;
    similar_moved := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Determine folder name
  v_sender_name := COALESCE(
    v_message.from->>'name',
    split_part(v_message.from->>'email', '@', 1),
    'Sin_remitente'
  );

  -- Sanitize: remove special chars, replace spaces, limit length
  v_sanitized_name := regexp_replace(
    regexp_replace(trim(COALESCE(p_folder_name, v_sender_name)), '\s+', '_', 'g'),
    '[<>:"/\\|?*]', '', 'g'
  );
  IF v_sanitized_name = '' THEN
    v_sanitized_name := 'Sin_nombre';
  END IF;
  v_sanitized_name := left(v_sanitized_name, 50);

  -- Find or create the folder
  SELECT mf.id, mf.path INTO v_folder_id, v_folder_path
  FROM public.mail_folders mf
  WHERE mf.account_id = v_account_id
    AND mf.type = 'user'
    AND lower(mf.name) = lower(v_sanitized_name)
    AND mf.parent_id IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    -- Create the folder
    INSERT INTO public.mail_folders (account_id, parent_id, name, path, type)
    VALUES (v_account_id, NULL, v_sanitized_name, '/' || v_sanitized_name, 'user')
    RETURNING id, path INTO v_folder_id, v_folder_path;
    v_folder_created := true;
  END IF;

  -- Move the starred email into the folder
  UPDATE public.mail_messages
  SET folder_id = v_folder_id, updated_at = now()
  WHERE id = p_message_id AND account_id = v_account_id;

  -- Collect system folders to exclude from similarity search
  SELECT array_agg(mf.id) INTO v_exclude
  FROM public.mail_folders mf
  WHERE mf.account_id = v_account_id
    AND mf.system_role IN ('trash', 'sent', 'drafts', 'spam');

  -- Optionally move similar emails
  IF p_move_similar THEN
    WITH similar_emails AS (
      SELECT sim.message_id
      FROM find_similar_emails_rpc(
        v_account_id,
        p_message_id,
        v_message.from->>'email',
        split_part(v_message.from->>'email', '@', 2),
        NULL, -- subject words handled by TypeScript engine instead
        v_exclude,
        100
      ) sim
      WHERE sim.score >= p_similar_threshold
    )
    UPDATE public.mail_messages mm
    SET folder_id = v_folder_id, updated_at = now()
    FROM similar_emails s
    WHERE mm.id = s.message_id;

    GET DIAGNOSTICS v_similar_count = ROW_COUNT;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');

  folder_created := v_folder_created;
  folder_id := v_folder_id;
  folder_path := v_folder_path;
  starred_email_moved := true;
  similar_moved := v_similar_count;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.auto_file_starred_rpc IS 'Auto-file a starred email: creates/uses a sender-named folder, moves the email, and optionally moves similar emails. Atomic transaction.';

COMMIT;
