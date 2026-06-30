-- ============================================
-- Migration: Insert the `free` plan row
-- Phase 1 / PR 1 of plans-pricing-freemium (Foundation).
--
-- Real zero-priced catalog entry with one included seat. Reuses the
-- existing `plans` table and the `change_company_plan` upgrade path.
-- Spec ref: F-FREE-001.
-- ============================================

BEGIN;

INSERT INTO public.plans (
  id, name, tagline, description,
  base_price_cents, currency, billing_period,
  included_users, extra_user_cents,
  included_modules, sort_order, is_active, is_highlighted
) VALUES (
  'free',
  'Free',
  'Empieza gratis con un usuario y los módulos básicos',
  'Plan gratuito para probar el CRM: 1 usuario, módulos core.',
  0, 'EUR', 'monthly',
  1, 0,
  ARRAY['core_/clientes','core_/webmail'],
  0, true,
  false
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;