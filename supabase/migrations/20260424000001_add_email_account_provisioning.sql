-- Migration: Add email account provisioning columns for SES + Route53 auto-verification
-- Part of: email-accounts-ses-automation change
--
-- Purpose: Track DKIM tokens, Route53 zone, and verification status for automatic
--          SES domain provisioning when domains are hosted in Route53.
--
-- verification_status values: 'pending', 'verifying', 'verified', 'failed'

ALTER TABLE company_email_accounts
ADD COLUMN dkim_tokens TEXT[],
ADD COLUMN route53_zone_id TEXT,
ADD COLUMN verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verifying', 'verified', 'failed')),
ADD COLUMN verified_error TEXT;

-- Backfill existing accounts as 'pending'
UPDATE company_email_accounts SET verification_status = 'pending' WHERE verification_status IS NULL;
