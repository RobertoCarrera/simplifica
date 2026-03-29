-- Migration: Add missing consent columns to clients table
-- BFF handleProfile() selects these columns but they didn't exist,
-- causing PostgREST to return 400 → BFF returned 500 on /profile.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS privacy_policy_consent      boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_policy_consent_date timestamptz,
  ADD COLUMN IF NOT EXISTS health_data_consent_date    timestamptz;
