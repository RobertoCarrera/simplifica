-- 20260624000000_redsys_vault_and_payments.sql
-- Redsys payments: Vault encryption + separate payments table + atomic finalize RPC.
-- Mirrors anima-caibs architecture (memory #1065, #729, #1085).
--
-- Goals:
--   1. The Redsys secret key is NEVER stored in plaintext in
--      `company_payment_config`. We move it to `vault.secrets` (pgsodium
--      AEAD at rest). `secret_key_encrypted` is kept as a legacy
--      placeholder column and cleared/ignored for new rows.
--   2. A separate `payments` table tracks every gateway payment attempt
--      (Redsys today, Stripe / PayPal / cash tomorrow). The
--      `contracted_services.status` flips via the finalize RPC, not by
--      frontend patching.
--   3. The finalize RPC is ATOMIC + IDEMPOTENT. If the notify endpoint
--      is called twice with the same order, it does not create a
--      duplicate payment or flip the contract twice. This is the bug
--      that bit anima-caibs in production — see memory #1085.
--
-- Deploy order: this migration → portal EFs (checkout/notify/return)
-- → portal frontend.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Vault helpers — service_role only.
-- ═══════════════════════════════════════════════════════════════════════

-- Make sure the pgsodium key + vault extension are present. Supabase
-- ships with both enabled; the IF NOT EXISTS makes this idempotent.
CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Naming convention: one Vault secret per company per provider.
--   name = 'redsys_secret_<company_id>'
--   description = 'Redsys SHA-256 secret key for company <company_id>'

-- Drops are safe: this is a fresh convention; nothing to clean.
-- (If we ever rename the convention, add an explicit DROP here.)

-- RPC: store the Redsys secret in Vault. Returns the Vault secret id
-- (uuid) so the caller can audit. SECURITY DEFINER: only the service
-- role can call it (we GRANT only to service_role).
CREATE OR REPLACE FUNCTION public.vault_store_redsys_secret(
  p_company_id  uuid,
  p_secret      text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_name text := 'redsys_secret_' || p_company_id::text;
  v_id   uuid;
BEGIN
  -- Encrypt by upserting a Vault secret.
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    -- create_secret returns the secret id.
    SELECT id INTO v_id FROM vault.create_secret(
      'redsys_secret_' || p_company_id::text,
      p_secret,
      'Redsys SHA-256 secret key for company ' || p_company_id::text
    );
  ELSE
    -- update_secret: only swap the secret value, keep the id stable.
    PERFORM vault.update_secret(v_id, p_secret);
  END IF;

  -- Best-effort: clear the legacy plaintext column on this company so
  -- we don't end up with two sources of truth.
  UPDATE public.company_payment_config
     SET secret_key_encrypted = NULL,
         updated_at = now()
   WHERE company_id = p_company_id
     AND provider = 'redsys';

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_store_redsys_secret(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_store_redsys_secret(uuid, text) TO service_role;

-- RPC: read the decrypted Redsys secret. service_role only — the
-- Edge Function uses the service_role key, so this is the natural
-- boundary. The plain text never crosses the boundary because the EF
-- strips it before logging.
CREATE OR REPLACE FUNCTION public.vault_get_redsys_secret(
  p_company_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_plain text;
BEGIN
  -- vault._decrypted_secrets is a view that exposes the plaintext
  -- only to roles with the right pgsodium key grant. service_role
  -- has it; we keep SECURITY DEFINER so the underlying permission
  -- check happens at function-call time, not at query time.
  SELECT decrypted_secret
    INTO v_plain
    FROM vault.decrypted_secrets
   WHERE name = 'redsys_secret_' || p_company_id::text
   LIMIT 1;
  RETURN v_plain;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_get_redsys_secret(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_get_redsys_secret(uuid) TO service_role;

-- RPC: does this company have a Redsys secret stored? Boolean for
-- the admin UI ("••••••" vs "no key yet"). Safe to expose to
-- authenticated; returns no key material.
CREATE OR REPLACE FUNCTION public.vault_redsys_key_exists(
  p_company_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.secrets
     WHERE name = 'redsys_secret_' || p_company_id::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.vault_redsys_key_exists(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_redsys_key_exists(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. payments table — one row per gateway payment attempt.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id              uuid NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
  contract_id            uuid NOT NULL REFERENCES public.contracted_services(id) ON DELETE CASCADE,

  -- Money (always integer cents to avoid float drift)
  amount_cents           integer NOT NULL CHECK (amount_cents >= 0),
  currency               text    NOT NULL DEFAULT '978',  -- ISO 4217 numeric

  -- Provider-agnostic
  provider               text    NOT NULL DEFAULT 'redsys'
                          CHECK (provider IN ('redsys', 'stripe', 'paypal', 'cash', 'bizum', 'apple_pay', 'google_pay')),
  status                 text    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  environment            text    NOT NULL DEFAULT 'test'
                          CHECK (environment IN ('test', 'production')),

  -- Provider-specific gateway metadata. Nullable: each gateway writes
  -- what it knows. Storing as text so we don't have to migrate the
  -- table every time Redsys adds a new field.
  gateway_order          text,             -- Redsys DS_MERCHANT_ORDER (also Ds_Order in notify)
  gateway_response_code  text,             -- Redsys Ds_Response (0000-9999)
  gateway_auth_code      text,             -- Redsys Ds_AuthCode (the transaction id for refunds)
  gateway_pay_method     text,             -- Redsys Ds_ProcessedPayMethod (1=Visa, 68=Bizum, etc.)
  gateway_raw_response   jsonb,            -- Full Redsys JSON for audit / disputes

  -- Lifecycle
  paid_at                timestamptz,
  failed_at              timestamptz,
  failure_reason         text,
  refunded_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- One payment row per contract attempt. If the user retries (different
  -- gateway_order), the OLD row stays for audit and a NEW row is created.
  -- The UI shows the latest paid row.
  UNIQUE (contract_id, gateway_order)
);

CREATE INDEX IF NOT EXISTS idx_payments_company_client   ON public.payments(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract         ON public.payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_status ON public.payments(provider, status);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_order    ON public.payments(gateway_order) WHERE gateway_order IS NOT NULL;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Clients read their own payments. Admin reads their company's payments.
DROP POLICY IF EXISTS "payments_client_select" ON public.payments;
CREATE POLICY "payments_client_select"
  ON public.payments FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM public.clients c
      WHERE c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "payments_company_owner_select" ON public.payments;
CREATE POLICY "payments_company_owner_select"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.company_id = payments.company_id
        AND cm.user_id = auth.uid()
        AND r.name = 'owner'
    )
  );

-- Inserts/updates/deletes are done by service_role via RPCs and the
-- Edge Functions, NOT by the client or owner. No INSERT/UPDATE/DELETE
-- policies on `authenticated` on purpose.

-- ═══════════════════════════════════════════════════════════════════════
-- 3. redsys_finalize_payment — atomic + idempotent finalize.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Called from the Redsys notify Edge Function. In one transaction:
--   a. Look up the gateway_order on `payments`. If status='paid', bail
--      (idempotency guard).
--   b. Mark the payment row as 'paid' (set paid_at + gateway_response_code
--      + gateway_auth_code + gateway_pay_method).
--   c. Flip `contracted_services.status` from 'pending_payment' to 'active'.
--   d. Record start_date / recurrence_start if not set.
--
-- ANY error rolls the whole transaction back. If we send KO to Redsys,
-- they'll retry the notify; the idempotency guard makes the retry safe.

CREATE OR REPLACE FUNCTION public.redsys_finalize_payment(
  p_order              text,
  p_response_code      text DEFAULT NULL,
  p_auth_code          text DEFAULT NULL,
  p_pay_method         text DEFAULT NULL,
  p_raw_response       jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment       public.payments%ROWTYPE;
  v_contract      public.contracted_services%ROWTYPE;
  v_already_paid  boolean := false;
BEGIN
  -- 1. Find the payment row by gateway_order.
  SELECT * INTO v_payment
    FROM public.payments
   WHERE gateway_order = p_order
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'No payment found for order ' || p_order
    );
  END IF;

  -- 2. Idempotency guard. If we already marked this payment paid, return
  --    the existing data without touching anything.
  IF v_payment.status = 'paid' THEN
    v_already_paid := true;
    RETURN jsonb_build_object(
      'success',      true,
      'already_paid', true,
      'payment_id',   v_payment.id,
      'contract_id',  v_payment.contract_id
    );
  END IF;

  -- 3. Look up the contract (we need to know which row to flip).
  SELECT * INTO v_contract
    FROM public.contracted_services
   WHERE id = v_payment.contract_id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Payment references a non-existent contract'
    );
  END IF;

  -- 4. Mark the payment as paid. The UNIQUE (contract_id, gateway_order)
  --    constraint means re-running with a different order is fine.
  UPDATE public.payments
     SET status                = 'paid',
         paid_at               = now(),
         gateway_response_code = COALESCE(p_response_code, gateway_response_code),
         gateway_auth_code     = COALESCE(p_auth_code,     gateway_auth_code),
         gateway_pay_method    = COALESCE(p_pay_method,    gateway_pay_method),
         gateway_raw_response  = COALESCE(p_raw_response,  gateway_raw_response),
         updated_at            = now()
   WHERE id = v_payment.id;

  -- 5. Flip the contract to active. Idempotent: if it's already active
  --    (e.g. a manual override), we just leave it.
  UPDATE public.contracted_services
     SET status          = 'active',
         start_date      = COALESCE(start_date, CURRENT_DATE),
         recurrence_start = COALESCE(recurrence_start, CURRENT_DATE),
         updated_at      = now()
   WHERE id = v_contract.id
     AND status <> 'active';

  RETURN jsonb_build_object(
    'success',      true,
    'already_paid', false,
    'payment_id',   v_payment.id,
    'contract_id',  v_contract.id,
    'pay_method',   p_pay_method
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Helper for the checkout EF: insert a pending payment row so the
--    notify can find it later by gateway_order.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.insert_pending_payment(
  p_company_id     uuid,
  p_client_id      uuid,
  p_contract_id    uuid,
  p_amount_cents   integer,
  p_currency       text,
  p_provider       text,
  p_environment    text,
  p_gateway_order  text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.payments (
    company_id, client_id, contract_id, amount_cents, currency,
    provider, environment, status, gateway_order
  ) VALUES (
    p_company_id, p_client_id, p_contract_id, p_amount_cents, COALESCE(p_currency, '978'),
    COALESCE(p_provider, 'redsys'), COALESCE(p_environment, 'test'), 'pending', p_gateway_order
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_pending_payment(uuid, uuid, uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_pending_payment(uuid, uuid, uuid, integer, text, text, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Mark the legacy plaintext column as deprecated (kept for now to
--    avoid breaking the existing settings UI; new writes should go
--    through vault_store_redsys_secret).
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.company_payment_config.secret_key_encrypted
  IS 'DEPRECATED: use vault.redsys_secret_<company_id> instead. New writes go through vault_store_redsys_secret().';