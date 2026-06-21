-- Migration: Add portal_features jsonb to companies
--
-- Purpose: Let each company decide which portal capabilities to enable,
-- independently. Today the only capability is 'booking' (reservas con slot
-- + profesional + duración), but the model is open to add 'catalog' and
-- 'shop' next to it. Multiple features can coexist for a single company
-- (e.g. a clinic that sells bono packs as catalog AND takes appointments
-- as booking).
--
-- Shape (canonical):
--   {
--     show_booking:    boolean  -- wizard con slot + profesional
--     show_catalog:    boolean  -- catálogo sin slots, con tiers / productos
--     show_shop:       boolean  -- catálogo + carrito + checkout
--     show_professionals: boolean  -- si show_booking, mostrar tab de profesionales
--     show_availability:   boolean  -- si show_booking, mostrar calendario/slots
--   }
--
-- Migration policy: NULL means "use defaults" (show_booking: true, all else
-- false) — this is a safe default that matches the current behavior for any
-- pre-existing company. Once a row is updated with an explicit object, the
-- client code will read it as-is.

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS portal_features jsonb NULL;

COMMENT ON COLUMN public.companies.portal_features IS 'Per-company portal capability flags. NULL = use defaults (booking only). Shape: {show_booking, show_catalog, show_shop, show_professionals, show_availability}. Multiple flags can be true at once.';

-- Backfill: write an explicit object on every active company so the field
-- is always present and the behavior is auditable. Default = booking only.
UPDATE public.companies
SET portal_features = jsonb_build_object(
  'show_booking', true,
  'show_catalog', false,
  'show_shop', false,
  'show_professionals', true,
  'show_availability', true
)
WHERE is_active = true
  AND portal_features IS NULL;

COMMIT;
