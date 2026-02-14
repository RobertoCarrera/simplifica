-- Migration to add GDPR consent tracking columns to clients table

-- 1. Create ENUM types if they don't exist
DO $$ BEGIN
    CREATE TYPE public.consent_status AS ENUM ('pending', 'accepted', 'rejected', 'revoked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.invitation_status AS ENUM ('not_sent', 'sent', 'opened', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS consent_status public.consent_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS marketing_consent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS consent_ip text,
ADD COLUMN IF NOT EXISTS privacy_policy_version text,
ADD COLUMN IF NOT EXISTS invitation_token uuid,
ADD COLUMN IF NOT EXISTS invitation_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS invitation_status public.invitation_status DEFAULT 'not_sent';

-- 3. Create index for invitation_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_invitation_token ON public.clients(invitation_token);

-- 4. Secure the new columns (RLS)
-- By default, RLS policies on 'clients' apply. 
-- We might need a specific policy for the public consent page to read/update SPECIFIC columns via RPC or Edge Function.
-- Since we will use an Edge Function with Service Role for the public access (to validate token), standard RLS is fine for CRM users.
