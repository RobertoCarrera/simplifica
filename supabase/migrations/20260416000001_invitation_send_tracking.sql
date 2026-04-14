-- Add send tracking columns to company_invitations for audit and debugging
ALTER TABLE company_invitations
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_count   INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN company_invitations.last_sent_at IS 'Timestamp of the last invitation email send attempt';
COMMENT ON COLUMN company_invitations.send_count   IS 'Number of times the invitation email was attempted';
