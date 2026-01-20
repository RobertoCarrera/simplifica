-- Migration: Add Threaded View RPCs
-- Date: 2026-01-15
-- Author: Simplifica Assistant

-- 1. Get Threads (Folder View)
CREATE OR REPLACE FUNCTION public.f_mail_get_threads(
    p_account_id UUID,
    p_folder_role TEXT, -- 'inbox', 'sent', etc.
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
    thread_id UUID,
    subject TEXT,
    snippet TEXT,
    last_message_at TIMESTAMPTZ,
    message_count BIGINT,
    participants JSONB[], -- Array of {name, email}
    has_attachments BOOLEAN,
    is_read BOOLEAN
) AS $$
DECLARE
    v_folder_id UUID;
BEGIN
    -- Get folder ID from role (and account)
    SELECT id INTO v_folder_id
    FROM public.mail_folders
    WHERE account_id = p_account_id AND system_role = p_folder_role;

    IF v_folder_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH thread_stats AS (
        SELECT 
            m.thread_id,
            COUNT(m.id) as msg_count,
            MAX(m.received_at) as last_msg_date,
            bool_or(m.is_read = false) as has_unread, -- If any msg is unread, thread is unread? No, usually thread read status depends on user logic. Let's say if ANY is unread, thread is unread.
            -- Actually, usually we query the mail_threads table directly if we maintain it. 
            -- But our mail_threads table might not be fully synced yet. 
            -- Let's join mail_threads with mail_messages to be safe, or just use mail_threads if we trust it.
            -- Let's trust mail_threads for metadata, but we need to filter by folder.
            -- Thread entries don't have folders, Messages do.
            -- A thread is "in" a folder if it has at least one message in that folder.
            array_agg(DISTINCT m."from") as senders
        FROM public.mail_messages m
        WHERE m.account_id = p_account_id
        AND m.folder_id = v_folder_id
        AND (p_search IS NULL OR m.subject ILIKE '%' || p_search || '%' OR m.body_text ILIKE '%' || p_search || '%')
        GROUP BY m.thread_id
    )
    SELECT 
        t.id as thread_id,
        t.subject,
        t.snippet,
        ts.last_msg_date as last_message_at,
        ts.msg_count as message_count,
        ts.senders as participants, -- Simplified for now
        false as has_attachments, -- TODO: Calculate
        NOT ts.has_unread as is_read -- If has_unread is true, is_read is false
    FROM public.mail_threads t
    JOIN thread_stats ts ON ts.thread_id = t.id
    ORDER BY ts.last_msg_date DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. Get Thread Messages (Detail View)
CREATE OR REPLACE FUNCTION public.f_mail_get_thread_messages(
    p_thread_id UUID,
    p_account_id UUID
)
RETURNS SETOF public.mail_messages AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.mail_messages
    WHERE thread_id = p_thread_id
    AND account_id = p_account_id
    ORDER BY received_at ASC;
END;
$$ LANGUAGE plpgsql;
