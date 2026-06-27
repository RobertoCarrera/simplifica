-- =====================================================
-- Portal-specific booking/contracting flags
-- =====================================================
-- The visibility refactor (20260624) split visibility into service-level
-- axes (is_public for Agenda, is_visible_in_portal for Portal) but kept
-- the action flags (is_bookable, allow_direct_contracting) shared across
-- both channels. Roberto asked for independent control on the Portal
-- channel: a service should be able to be visible-in-portal but
-- disallow booking, or be contractable in the agenda but not from the
-- portal, etc.
--
-- This migration adds two nullable boolean flags that, when NULL,
-- fall back to the agenda-level flag (so existing rows behave exactly
-- as before). We use NULL instead of DEFAULT true to keep the schema
-- honest about which flags were explicitly set by the user.
-- =====================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_bookable_in_portal BOOLEAN,
  ADD COLUMN IF NOT EXISTS allow_direct_contracting_in_portal BOOLEAN;

-- Backfill: existing rows get the agenda value so behaviour is preserved
-- until a user explicitly toggles the portal-specific flag.
UPDATE public.services
SET is_bookable_in_portal = COALESCE(is_bookable_in_portal, is_bookable),
    allow_direct_contracting_in_portal = COALESCE(allow_direct_contracting_in_portal, allow_direct_contracting)
WHERE is_bookable_in_portal IS NULL
   OR allow_direct_contracting_in_portal IS NULL;

COMMENT ON COLUMN public.services.is_bookable_in_portal IS
  'When true, clients can book this service from the portal. NULL is treated as fallback to services.is_bookable.';
COMMENT ON COLUMN public.services.allow_direct_contracting_in_portal IS
  'When true, clients can directly contract this service from the portal. NULL is treated as fallback to services.allow_direct_contracting.';