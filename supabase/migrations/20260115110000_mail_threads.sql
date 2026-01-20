-- Function to get threads (grouped messages)
-- We assume system folders like 'Inbox', 'Sent' might need specific filtering logic if they are virtual, 
-- but here we assume 'folder_id' is passed.
-- However, the frontend currently passes a "folder path" (e.g. 'inbox').
-- We might need to resolve folder_id first or pass it. 
-- For now, let's look at how getMessages worked. It filtered by explicit folder assignment.

CREATE OR REPLACE FUNCTION f_mail_get_threads(
  p_account_id uuid,  -- The mail account ID (optional filter if we want to support multiple accounts view)
  p_folder_name text, -- 'inbox', 'sent', 'drafts', 'trash', 'spam' or custom folder ID
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  thread_id uuid,
  subject text,
  snippet text,
  last_message_at timestamptz,
  message_count bigint,
  participants text[], -- Array of sender names/emails
  is_read boolean,     -- True if all messages are read (or logic: true if NO unread messages)
  has_attachments boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_id uuid;
BEGIN
  -- 1. Resolve Folder ID if it's a known system folder name
  -- Or handle 'inbox' logic (often just "not trash/spam/drafts/sent" if not using explicit folders check?)
  -- In this system, we seem to have 'mail_folders' table.
  
  -- If p_folder_name is a UUID, use it directly.
  -- If it's a name, look it up in mail_folders for the current user's company/account.
  -- BUT p_account_id might be needed to find the right folder if names are not unique across accounts.
  
  -- SIMPLIFICATION: We assume `mail_folders` has a `name` column like 'inbox', 'sent'.
  -- And we filter by the account's folders.
  
  -- Let's try to find the folder_id first.
  SELECT id INTO v_folder_id
  FROM mail_folders
  WHERE (name = p_folder_name OR id::text = p_folder_name)
  -- AND account_id = p_account_id -- If we want strict account separation (recommended)
  LIMIT 1;

  -- Default to returning nothing if folder not found (unless special logic)
  IF v_folder_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH thread_stats AS (
    SELECT
      m.thread_id,
      MAX(m.received_at) as max_date,
      COUNT(*) as cnt,
      BOOL_AND(m.is_read) as all_read, -- If all are read, then true. If one is unread (false), result is false.
      BOOL_OR( COALESCE(jsonb_array_length(m.metadata->'attachments') > 0, false) ) as has_att
    FROM mail_messages m
    WHERE m.folder_id = v_folder_id
    GROUP BY m.thread_id
  ),
  latest_msg AS (
    SELECT DISTINCT ON (m.thread_id)
      m.thread_id,
      m.subject,
      m.snippet,
      m.from
    FROM mail_messages m
    WHERE m.folder_id = v_folder_id
    ORDER BY m.thread_id, m.received_at DESC
  ),
  participants_agg AS (
    -- Get distinct senders for the thread
    SELECT 
      m.thread_id,
      array_agg(DISTINCT 
        CASE 
           WHEN (m.from->>'name') IS NOT NULL AND (m.from->>'name') != '' THEN (m.from->>'name')
           ELSE (m.from->>'email')
        END
      ) as senders
    FROM mail_messages m
    WHERE m.folder_id = v_folder_id
    GROUP BY m.thread_id
  )
  SELECT
    ts.thread_id,
    lm.subject,
    lm.snippet,
    ts.max_date as last_message_at,
    ts.cnt as message_count,
    pa.senders as participants,
    ts.all_read as is_read,
    ts.has_att as has_attachments
  FROM thread_stats ts
  JOIN latest_msg lm ON lm.thread_id = ts.thread_id
  LEFT JOIN participants_agg pa ON pa.thread_id = ts.thread_id
  ORDER BY ts.max_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get all messages in a thread
CREATE OR REPLACE FUNCTION f_mail_get_thread_messages(
  p_thread_id uuid
)
RETURNS SETOF mail_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM mail_messages
  WHERE thread_id = p_thread_id
  ORDER BY received_at ASC;
$$;
