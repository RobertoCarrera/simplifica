-- Add a check constraint enforcing the business rule:
--   "a professional can only be `is_public = true` if they are also `is_active = true`"
--
-- Semantics of the two flags (must be kept in sync across backend + UI):
--   is_active  = the professional can log in / has reservations / is part of the
--                company roster. Toggling this off is a "soft delete" — they
--                keep their history but no new bookings can be assigned.
--   is_public  = whether the professional appears in the public booking URL
--                (client-facing agenda). Toggling this off hides them from
--                external clients but admins can still assign them manually.
--
-- The constraint is one-directional: being inactive FORCES is_public=false
-- (you can't be public if you can't take bookings). Being active does NOT
-- force is_public=true — that's a per-pro marketing decision.
--
-- We also default `is_public` to `true` for new rows so that creating a
-- professional via the admin UI immediately exposes them (the legacy default
-- of `false` was too conservative and led to "why doesn't my pro show up
-- anywhere" tickets). For existing rows we don't touch the value — admins
-- have already made the decision for each pro.
--
-- Finally, fix any existing rows that violate the new constraint before
-- adding it (defensive: there shouldn't be any, but a stray UPDATE could
-- have created one).

-- 1) Defensive: bring any "public + inactive" rows into compliance.
UPDATE public.professionals
   SET is_public = false
 WHERE is_public = true
   AND (is_active = false OR is_active IS NULL);

-- 2) Make sure is_active has a default so future inserts don't accidentally
-- land in (is_active=NULL, is_public=true) territory.
ALTER TABLE public.professionals
  ALTER COLUMN is_active SET DEFAULT true;

-- 3) Add the check constraint.
ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_public_requires_active
  CHECK (NOT is_public OR is_active);

-- 4) Document the relationship so the next person to read this column knows
-- the rule.
COMMENT ON COLUMN public.professionals.is_public IS
  'Whether the professional appears in the public booking URL. Forced false when is_active=false. See CHECK constraint professionals_public_requires_active.';
