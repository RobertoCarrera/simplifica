-- Migration: GDPR Deadline Alert System
-- Adds tracking columns to prevent duplicate deadline notifications
-- and support the automated cron-based alert system.

ALTER TABLE public.gdpr_access_requests
  ADD COLUMN IF NOT EXISTS deadline_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS overdue_notification_sent_at TIMESTAMPTZ;

-- Index for efficient querying of requests pending deadline notifications
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_pending_deadline_notif
  ON public.gdpr_access_requests (deadline_date)
  WHERE processing_status NOT IN ('completed', 'rejected')
    AND verification_status != 'rejected'
    AND deadline_warning_sent_at IS NULL;
