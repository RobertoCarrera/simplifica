-- 20260623000000_company_payment_config.sql
-- Adds the per-company payment-gateway configuration (Redsys for now).
-- Each company has at most one row per provider. The secret_key is
-- stored encrypted-by-application (see redsys.service.ts: client
-- encrypts with a Supabase Vault key before persisting).
--
-- RLS: only company owners can read/write their config. The portal
-- side reads it via the service-role BFF (client-portal-modules) and
-- never exposes the secret to the client.

CREATE TABLE IF NOT EXISTS public.company_payment_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider            text NOT NULL DEFAULT 'redsys'
                      CHECK (provider IN ('redsys')),
  -- FUC: Código de comercio assigned by Redsys (e.g. 999008881)
  merchant_code       text,
  -- Terminal number (usually 1 for online TPV Virtual)
  terminal            text NOT NULL DEFAULT '1',
  -- Encrypted SHA-256 secret key assigned by Redsys (32 chars in test,
  -- 64 in production). Application encrypts with pgsodium/Vault before insert.
  secret_key_encrypted text,
  -- 'test' = Redsys sandbox (sis-t.redsys.es), 'production' = real TPV
  environment         text NOT NULL DEFAULT 'test'
                      CHECK (environment IN ('test', 'production')),
  -- ISO 4217 numeric (978 = EUR)
  currency            text NOT NULL DEFAULT '978',
  -- Master switch. When false, the BFF hides Redsys from the client's
  -- payment-method picker even if the other fields are filled in.
  enabled             boolean NOT NULL DEFAULT false,
  -- Optional override. If null, BFF builds it from its own URL.
  notify_url          text,
  -- Optional trade name shown in the Redsys-hosted page.
  merchant_name       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_company_payment_config_company
  ON public.company_payment_config(company_id);

-- updated_at trigger (reuses the helper if present, else inline)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_payment_config_updated_at
  ON public.company_payment_config;
CREATE TRIGGER trg_company_payment_config_updated_at
  BEFORE UPDATE ON public.company_payment_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_payment_config ENABLE ROW LEVEL SECURITY;

-- Only owners of the company can read their config
DROP POLICY IF EXISTS "company_payment_config_owner_select" ON public.company_payment_config;
CREATE POLICY "company_payment_config_owner_select"
  ON public.company_payment_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_payment_config.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'owner'
    )
  );

-- Only owners of the company can insert/update their config
DROP POLICY IF EXISTS "company_payment_config_owner_write" ON public.company_payment_config;
CREATE POLICY "company_payment_config_owner_write"
  ON public.company_payment_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_payment_config.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_payment_config.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'owner'
    )
  );
