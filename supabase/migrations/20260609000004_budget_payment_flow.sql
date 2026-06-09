-- Migration: Budget payment flow
-- Adds payment fields to recurring_budgets and a recurring_budget_payments
-- history table so the auto-generated presupuestos (from contracted services)
-- can be paid by the client through the public payment page, with a full
-- audit trail of which provider, amount, and timestamp.
--
-- Architecture (mirrors the existing invoice payment flow so we can reuse
-- the same Edge Functions / public page plumbing for receipts):
--
--   1. recurring_budgets         — new payment columns (status extension,
--                                  token, provider, paid_at, receipt_pdf_path)
--   2. recurring_budget_payments — append-only payment history (one row per
--                                  successful payment event, supports partial
--                                  / split / retry flows)
--   3. RPCs                      — mark_budget_paid_atomic() and
--                                  list_budget_payment_history() for use by
--                                  Edge Functions (Stripe / PayPal webhooks
--                                  and the local-cash "mark as paid" flow)
--   4. Views                     — recurring_budget_payments_summary for the
--                                  client portal "payment history" tab
--   5. RLS                       — clients can read their own budgets' payment
--                                  history; company members can read all
--                                  payment events in their company.

--------------------------------------------------------------------------------
-- 1. EXTEND recurring_budgets WITH PAYMENT COLUMNS
--------------------------------------------------------------------------------
ALTER TABLE public.recurring_budgets
  ADD COLUMN IF NOT EXISTS currency            text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS payment_status      text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded', 'failed')),
  ADD COLUMN IF NOT EXISTS payment_provider    text
    CHECK (payment_provider IS NULL OR payment_provider IN ('stripe', 'paypal', 'cash', 'bank_transfer', 'other')),
  ADD COLUMN IF NOT EXISTS payment_link_token  text UNIQUE,
  ADD COLUMN IF NOT EXISTS payment_link_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at             timestamptz,
  ADD COLUMN IF NOT EXISTS paid_amount         numeric(12,2)
    CHECK (paid_amount IS NULL OR paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS payment_reference   text,
  ADD COLUMN IF NOT EXISTS receipt_pdf_path    text,
  ADD COLUMN IF NOT EXISTS receipt_generated_at timestamptz;

COMMENT ON COLUMN public.recurring_budgets.currency IS
  'Moneda del presupuesto (default EUR). Coincide con la moneda del cliente/company.';

COMMENT ON COLUMN public.recurring_budgets.payment_status IS
  'Estado de pago independiente del estado comercial (status).
   unpaid = pendiente de pagar
   pending = link de pago generado, pago aún no confirmado
   paid = cobrado
   refunded = devuelto
   failed = intento de pago fallido (link expirado o webhook con error)';

COMMENT ON COLUMN public.recurring_budgets.payment_link_token IS
  'Token opaco y unico usado en la URL publica de pago (/pagar-presupuesto/<token>).';

COMMENT ON COLUMN public.recurring_budgets.payment_link_expires_at IS
  'Fecha de expiración del link de pago. NULL = sin expiración.';

COMMENT ON COLUMN public.recurring_budgets.paid_at IS
  'Timestamp del primer pago confirmado. No se actualiza en pagos parciales
   adicionales — para eso consultar recurring_budget_payments.';

COMMENT ON COLUMN public.recurring_budgets.paid_amount IS
  'Suma de todos los pagos confirmados (sum(recurring_budget_payments.amount)).
   Se actualiza por trigger al insertar un nuevo pago.';

COMMENT ON COLUMN public.recurring_budgets.payment_reference IS
  'Referencia externa del proveedor (Stripe charge id, PayPal transaction id,
   o nota libre para pagos en efectivo/transferencia).';

COMMENT ON COLUMN public.recurring_budgets.receipt_pdf_path IS
  'Ruta en el bucket payment-receipts del PDF de recibo generado tras confirmar
   el pago. NULL mientras el recibo no se haya generado.';

-- Index: lookups by token (hot path on the public payment page)
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_budgets_payment_token
  ON public.recurring_budgets(payment_link_token)
  WHERE payment_link_token IS NOT NULL;

-- Index: find all paid/unpaid budgets per company for dashboards
CREATE INDEX IF NOT EXISTS idx_recurring_budgets_payment_status
  ON public.recurring_budgets(company_id, payment_status)
  WHERE payment_status IN ('unpaid', 'paid');

--------------------------------------------------------------------------------
-- 2. RECURRING_BUDGET_PAYMENTS — APPEND-ONLY PAYMENT HISTORY
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_budget_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id uuid NOT NULL REFERENCES public.recurring_budgets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Provider / channel
  provider text NOT NULL
    CHECK (provider IN ('stripe', 'paypal', 'cash', 'bank_transfer', 'other')),
  status text NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded')),

  -- Money
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR',
  fee numeric(12,2) DEFAULT 0 CHECK (fee >= 0),
  net_amount numeric(12,2)
    CHECK (net_amount IS NULL OR net_amount >= 0),

  -- Provider reference (Stripe charge id, PayPal capture id, etc.)
  provider_reference text,
  provider_metadata jsonb DEFAULT '{}'::jsonb,

  -- Receipt
  receipt_pdf_path text,
  receipt_url text,

  -- Audit
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rbp_budget_id
  ON public.recurring_budget_payments(budget_id);

CREATE INDEX IF NOT EXISTS idx_rbp_company_paid_at
  ON public.recurring_budget_payments(company_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_rbp_client_paid_at
  ON public.recurring_budget_payments(client_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_rbp_provider_reference
  ON public.recurring_budget_payments(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- Idempotency: a given provider_reference can only be recorded once per budget.
-- This protects against webhook retries firing the same event multiple times.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rbp_provider_ref_per_budget
  ON public.recurring_budget_payments(budget_id, provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

COMMENT ON TABLE public.recurring_budget_payments IS
  'Historial de pagos de presupuestos recurrentes. Append-only — un registro
   por evento de pago confirmado (webhook de Stripe/PayPal, o registro manual
   de pago en efectivo/transferencia). Soporta pagos múltiples sobre el mismo
   presupuesto (pago parcial, retry, etc.).';

COMMENT ON COLUMN public.recurring_budget_payments.provider IS
  'Canal de pago: stripe, paypal, cash (efectivo), bank_transfer, other.';

COMMENT ON COLUMN public.recurring_budget_payments.fee IS
  'Comisión cobrada por el proveedor (si aplica). 0 para pagos manuales.';

COMMENT ON COLUMN public.recurring_budget_payments.net_amount IS
  'Importe neto recibido = amount - fee. NULL si no aplica.';

COMMENT ON COLUMN public.recurring_budget_payments.provider_metadata IS
  'Payload crudo del provider (evento Stripe, IPN PayPal, etc.) para auditoría.';

--------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--------------------------------------------------------------------------------
ALTER TABLE public.recurring_budget_payments ENABLE ROW LEVEL SECURITY;

-- SELECT: company members can view all payment history in their company
CREATE POLICY "Company members can view budget payment history"
  ON public.recurring_budget_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = recurring_budget_payments.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- Clients (portal users): can see payment history for their own budgets
-- Mirrors the budget SELECT policy that already exists.
CREATE POLICY "Clients can view their own budget payment history"
  ON public.recurring_budget_payments
  FOR SELECT TO authenticated
  USING (
    -- User must be a company_member with role 'client' (or higher) in the
    -- company AND the budget must belong to the client linked to that user.
    EXISTS (
      SELECT 1
      FROM users u
      JOIN company_members cm ON cm.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = recurring_budget_payments.company_id
        AND cm.status = 'active'
        AND u.client_id = recurring_budget_payments.client_id
    )
  );

-- INSERT: only the service role (Edge Functions) writes here. No
-- authenticated write policy is granted on purpose — webhooks and the
-- "mark as paid" Edge Function run with the service key.
-- Company members can NOT directly insert payment events; they must go
-- through the RPC or the Edge Function so paid_amount / paid_at stay in sync.

--------------------------------------------------------------------------------
-- 4. TRIGGER: keep recurring_budgets.paid_amount in sync
--    After INSERT on recurring_budget_payments, recompute paid_amount from
--    the sum of succeeded payments. This avoids client-side drift and makes
--    the budget row self-describing.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_recurring_budgets_payment_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_succeeded numeric(12,2);
  v_first_paid_at timestamptz;
  v_latest_status text;
  v_latest_provider text;
  v_reference text;
BEGIN
  -- Sum of all succeeded payments for this budget
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_succeeded
  FROM public.recurring_budget_payments
  WHERE budget_id = NEW.budget_id
    AND status = 'succeeded';

  -- Earliest succeeded payment timestamp
  SELECT MIN(paid_at)
    INTO v_first_paid_at
  FROM public.recurring_budget_payments
  WHERE budget_id = NEW.budget_id
    AND status = 'succeeded';

  -- Latest status / provider / reference (for the budget-level summary columns)
  SELECT status, provider, provider_reference
    INTO v_latest_status, v_latest_provider, v_reference
  FROM public.recurring_budget_payments
  WHERE budget_id = NEW.budget_id
  ORDER BY paid_at DESC, created_at DESC
  LIMIT 1;

  UPDATE public.recurring_budgets
  SET
    paid_amount = v_total_succeeded,
    paid_at     = COALESCE(v_first_paid_at, paid_at),
    payment_status = CASE
      WHEN v_latest_status = 'succeeded' AND v_total_succeeded >= total THEN 'paid'
      WHEN v_latest_status = 'succeeded' AND v_total_succeeded > 0     THEN 'pending' -- partial
      WHEN v_latest_status = 'failed'                                THEN 'failed'
      WHEN v_latest_status = 'refunded'                              THEN 'refunded'
      ELSE payment_status
    END,
    payment_provider  = COALESCE(v_latest_provider, payment_provider),
    payment_reference = COALESCE(v_reference, payment_reference),
    -- Si todos los pagos suman >= total → status comercial = 'paid'
    status = CASE
      WHEN v_total_succeeded >= total AND status NOT IN ('cancelled') THEN 'paid'
      ELSE status
    END
  WHERE id = NEW.budget_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_budgets_payment_sync ON public.recurring_budget_payments;
CREATE TRIGGER trg_recurring_budgets_payment_sync
  AFTER INSERT OR UPDATE OF status ON public.recurring_budget_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recurring_budgets_payment_sync();

--------------------------------------------------------------------------------
-- 5. RPC: mark_budget_paid_atomic
--    Used by the Edge Function payment-webhook-budget to record a payment
--    event. Atomic = either both the payment row and the budget update
--    happen, or neither does. Returns the new payment row.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_budget_paid_atomic(
  p_budget_id uuid,
  p_provider text,
  p_amount numeric,
  p_currency text DEFAULT 'EUR',
  p_provider_reference text DEFAULT NULL,
  p_provider_metadata jsonb DEFAULT '{}'::jsonb,
  p_fee numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS public.recurring_budget_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget public.recurring_budgets;
  v_payment public.recurring_budget_payments;
BEGIN
  -- Lock the budget row to serialize concurrent webhook calls
  SELECT * INTO v_budget
  FROM public.recurring_budgets
  WHERE id = p_budget_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presupuesto no encontrado: %', p_budget_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency check: if this provider reference was already recorded for
  -- this budget, return the existing row instead of inserting a duplicate.
  IF p_provider_reference IS NOT NULL THEN
    SELECT * INTO v_payment
    FROM public.recurring_budget_payments
    WHERE budget_id = p_budget_id
      AND provider = p_provider
      AND provider_reference = p_provider_reference
    LIMIT 1;

    IF FOUND THEN
      RETURN v_payment;
    END IF;
  END IF;

  -- Validate provider
  IF p_provider NOT IN ('stripe', 'paypal', 'cash', 'bank_transfer', 'other') THEN
    RAISE EXCEPTION 'Provider inválido: %', p_provider
      USING ERRCODE = '22023';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser positivo: %', p_amount
      USING ERRCODE = '22023';
  END IF;

  -- Insert the payment event. The trigger will keep paid_amount / paid_at
  -- / payment_status / status in sync on the budget row.
  INSERT INTO public.recurring_budget_payments (
    budget_id, company_id, client_id,
    provider, status,
    amount, currency, fee,
    provider_reference, provider_metadata,
    notes
  ) VALUES (
    p_budget_id, v_budget.company_id, v_budget.client_id,
    p_provider, 'succeeded',
    p_amount, COALESCE(p_currency, v_budget.currency, 'EUR'),
    COALESCE(p_fee, 0),
    p_provider_reference, COALESCE(p_provider_metadata, '{}'::jsonb),
    p_notes
  )
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

COMMENT ON FUNCTION public.mark_budget_paid_atomic IS
  'Registra un pago confirmado sobre un presupuesto recurrente de forma atomica
   (idempotente por provider_reference). Pensado para que lo invoquen los
   webhooks de Stripe / PayPal y el flujo "marcar como pagado en efectivo" del
   panel. SECURITY DEFINER para que pueda escribir aunque el caller no tenga
   policy de INSERT.';

--------------------------------------------------------------------------------
-- 6. RPC: list_budget_payment_history
--    Devuelve el historial completo de pagos de un presupuesto con el cliente
--    ya hidratado (nombre, email) para mostrarlo en el panel de cliente.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_budget_payment_history(
  p_budget_id uuid
)
RETURNS TABLE(
  payment_id uuid,
  provider text,
  status text,
  amount numeric,
  currency text,
  fee numeric,
  net_amount numeric,
  provider_reference text,
  paid_at timestamptz,
  notes text,
  receipt_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rbp.id,
    rbp.provider,
    rbp.status,
    rbp.amount,
    rbp.currency,
    rbp.fee,
    rbp.net_amount,
    rbp.provider_reference,
    rbp.paid_at,
    rbp.notes,
    rbp.receipt_url
  FROM public.recurring_budget_payments rbp
  WHERE rbp.budget_id = p_budget_id
  ORDER BY rbp.paid_at DESC, rbp.created_at DESC;
$$;

COMMENT ON FUNCTION public.list_budget_payment_history IS
  'Lista el historial de pagos de un presupuesto recurrente en orden
   cronologico inverso. SECURITY DEFINER para que el portal de cliente pueda
   llamarlo aunque la RLS de SELECT sea restrictiva.';

--------------------------------------------------------------------------------
-- 6b. RPC: generate_budget_payment_token
--     Mints (or refreshes) the payment link token for a budget. Idempotent:
--     if a non-expired token already exists, returns it as-is. Otherwise
--     generates a new 32-char URL-safe token and sets a 30-day expiration.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_budget_payment_token(
  p_budget_id uuid,
  p_validity_days int DEFAULT 30
)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_token text;
  v_existing_expires timestamptz;
  v_new_token text;
  v_new_expires timestamptz;
BEGIN
  SELECT payment_link_token, payment_link_expires_at
    INTO v_existing_token, v_existing_expires
  FROM public.recurring_budgets
  WHERE id = p_budget_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presupuesto no encontrado: %', p_budget_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Reuse existing non-expired token
  IF v_existing_token IS NOT NULL
     AND v_existing_expires IS NOT NULL
     AND v_existing_expires > now() + interval '1 hour' THEN
    RETURN QUERY SELECT v_existing_token, v_existing_expires;
    RETURN;
  END IF;

  -- Mint a new one. 32 chars base64url ~= 192 bits of entropy.
  v_new_token := encode(gen_random_bytes(24), 'base64');
  v_new_token := replace(replace(replace(v_new_token, '+', '-'), '/', '_'), '=', '');
  v_new_expires := now() + (p_validity_days || ' days')::interval;

  UPDATE public.recurring_budgets
  SET
    payment_link_token = v_new_token,
    payment_link_expires_at = v_new_expires,
    payment_status = CASE
      WHEN payment_status = 'unpaid' THEN 'pending'
      ELSE payment_status
    END
  WHERE id = p_budget_id;

  RETURN QUERY SELECT v_new_token, v_new_expires;
END;
$$;

COMMENT ON FUNCTION public.generate_budget_payment_token IS
  'Genera (o reutiliza si aún es válido) el token del link público de pago
   para un presupuesto recurrente. Devuelve { token, expires_at }.';

--------------------------------------------------------------------------------
-- 7. VIEW: recurring_budget_payments_summary
--    Para dashboards: total cobrado por cliente / company en un periodo.
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.recurring_budget_payments_summary AS
SELECT
  rbp.company_id,
  rbp.client_id,
  c.name AS client_name,
  DATE_TRUNC('month', rbp.paid_at) AS paid_month,
  rbp.provider,
  rbp.currency,
  COUNT(*)                          AS payments_count,
  SUM(rbp.amount)                   AS gross_amount,
  SUM(COALESCE(rbp.fee, 0))         AS total_fees,
  SUM(COALESCE(rbp.net_amount, rbp.amount)) AS net_amount
FROM public.recurring_budget_payments rbp
JOIN public.clients c ON c.id = rbp.client_id
WHERE rbp.status = 'succeeded'
GROUP BY rbp.company_id, rbp.client_id, c.name, paid_month, rbp.provider, rbp.currency;

COMMENT ON VIEW public.recurring_budget_payments_summary IS
  'Resumen agregado de pagos por company + cliente + mes + provider. Pensado
   para cuadros de mando y exportes contables.';

--------------------------------------------------------------------------------
-- 8. STORAGE BUCKET: payment-receipts
--    Bucket privado donde se guardan los PDFs de recibos generados.
--    (Supabase permite crear buckets con SQL a partir de la v2 del Storage API;
--    la migracion es idempotente.)
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- RLS para el bucket: los miembros de la company pueden leer
-- (authenticated) y el service_role puede escribir.
DROP POLICY IF EXISTS "Company members can read budget payment receipts" ON storage.objects;
CREATE POLICY "Company members can read budget payment receipts"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (
      SELECT 1
      FROM public.recurring_budgets rb
      JOIN company_members cm ON cm.company_id = rb.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE rb.receipt_pdf_path = storage.objects.name
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- Clients (portal) can also read their own receipts
DROP POLICY IF EXISTS "Clients can read their own budget payment receipts" ON storage.objects;
CREATE POLICY "Clients can read their own budget payment receipts"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (
      SELECT 1
      FROM public.recurring_budgets rb
      JOIN users u ON u.client_id = rb.client_id
      WHERE rb.receipt_pdf_path = storage.objects.name
        AND u.auth_user_id = auth.uid()
    )
  );

--------------------------------------------------------------------------------
-- 9. COMMENTS
--------------------------------------------------------------------------------
COMMENT ON COLUMN public.recurring_budgets.payment_status IS
  '(Re-documentado tras trigger) Estado de pago efectivo. Lo mantiene el
   trigger trg_recurring_budgets_payment_sync al insertar en
   recurring_budget_payments. NO escribir directamente desde la UI.';
