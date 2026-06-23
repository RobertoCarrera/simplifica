-- Add payment_method column to bookings table
-- Reason: the "Marcar como pagado" action in the calendar's event details modal
-- must now prompt for the payment method (cash / bank_transfer / card / direct_debit /
-- paypal / other) and persist it on the booking. The enum `payment_method` already
-- exists in this database (used by invoice_payments and others) — we just reuse it.
--
-- The column is NULLABLE so existing bookings aren't forced into a payment state.
-- Going forward, the UI requires a non-null value whenever payment_status is set
-- to 'paid'.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method;

-- Helpful partial index for reporting "how many bookings were paid by method X this month"
-- (e.g. cash vs card mix). Skips nulls so the index stays small.
CREATE INDEX IF NOT EXISTS idx_bookings_payment_method
  ON public.bookings (company_id, payment_method)
  WHERE payment_method IS NOT NULL;

-- Comment so the next person to read this column knows why it's nullable and
-- what the application-layer contract is.
COMMENT ON COLUMN public.bookings.payment_method IS
  'Forma de pago registrada cuando se marca la reserva como pagada. NULL en reservas pendientes. La UI exige un valor no-nulo antes de fijar payment_status=paid.';
