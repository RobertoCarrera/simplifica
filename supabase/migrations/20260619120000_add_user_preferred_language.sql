-- Add per-user UI language preference.
-- Wins over company default and browser language detection.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'es'
    CHECK (preferred_language IN ('es', 'ca', 'de'));

COMMENT ON COLUMN public.users.preferred_language IS
  'Per-user UI language preference. Wins over company default and browser language detection.';
