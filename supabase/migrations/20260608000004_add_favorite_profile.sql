-- Add favorite profile columns to users table
-- Allows users to mark one company or professional as favorite for default selection on login

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS favorite_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS favorite_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_favorite_company ON public.users(favorite_company_id) WHERE favorite_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_favorite_professional ON public.users(favorite_professional_id) WHERE favorite_professional_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.users.favorite_company_id IS 'Favorite company for default profile selection on login. Only one company can be favorite at a time (enforced by UI).';
COMMENT ON COLUMN public.users.favorite_professional_id IS 'Favorite professional for default profile selection on login. Only one professional can be favorite at a time (enforced by UI).';
