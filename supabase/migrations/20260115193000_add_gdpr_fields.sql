-- Add GDPR fields to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS gdpr_consent_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS gdpr_accepted BOOLEAN DEFAULT FALSE;
