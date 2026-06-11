-- Migration: Add 'bizum' and 'online' to the payment_method enum
--
-- Root cause: the payment_method enum (cash, bank_transfer, card,
-- direct_debit, paypal, other) doesn't cover two methods the business
-- uses today:
--   - bizum (a popular Spanish instant-transfer method — semantically
--     distinct from card payments because it has different settlement)
--   - online (a catch-all for portal/Stripe payments that don't map
--     cleanly to paypal or card)
--
-- The new event-form modal needs to ask the user for the payment method
-- when "Crear y marcar como pagado" is clicked, and store the value
-- directly in bookings.payment_method.
--
-- Adding values to a Postgres enum is safe and non-breaking — existing
-- rows are unaffected, and the new values can be inserted without
-- schema rewrites.

BEGIN;

-- Postgres enums don't support adding multiple values in a single
-- ALTER TYPE statement cleanly across all versions, so we add one
-- at a time. IF NOT EXISTS makes this idempotent.
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'bizum';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'online';

COMMIT;
