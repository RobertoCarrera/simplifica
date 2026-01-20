-- Create scheduled_notifications table to track communication history
CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('reminder_24h', 'reminder_1h', 'review_request')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup of pending notifications
CREATE INDEX IF NOT EXISTS idx_sched_notif_pending ON public.scheduled_notifications(status, type, booking_id);

-- Enable pg_cron if not enabled (Requires Superuser, might fail if not permitted, but standard on Supabase Platform)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a Cron Job to call the Edge Function every hour
-- We use pg_net to make the HTTP request to the Edge Function
-- NOTE: You must replace 'YOUR_PROJECT_REF' and 'YOUR_ANON_KEY' with actual values or handle this via a secure function wrapper.
-- Ideally, we create a secure RPC that makes the call, or we just rely on the Edge Function being public (with internal security verify).

-- Since we can't easily hardcode the URL/Key in SQL without security risks or environment variable access,
-- we will CREATE the table here, but the CRON JOB setup is best handled manually or via a dedicated "Setup" script 
-- that the user runs where they can inject their specific URL.
-- Alternatively, we can assume the user will configure the cron via the Dashboard.

-- However, to be helpful, we'll try to set up a placeholder job if possible, or just comments.

COMMENT ON TABLE public.scheduled_notifications IS 'Tracks automated emails sent to clients to prevent duplicates.';
