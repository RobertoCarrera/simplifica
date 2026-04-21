-- Add onboarding_completed flag to users table
-- This ensures users cannot access the app until they complete the full onboarding flow
-- (profile data + mandatory TOTP enrollment for owners/admins)

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON public.users(onboarding_completed) WHERE onboarding_completed = false;

-- Comment for documentation
COMMENT ON COLUMN public.users.onboarding_completed IS
  'Set to true only after user completes full onboarding: profile data AND TOTP verification (for owners/admins). Used to prevent app access until onboarding is done.';