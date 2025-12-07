-- Migration: Payment integrations for PayPal and Stripe
-- Date: 2024-12-07
-- Description: Creates tables for storing payment provider credentials and 
--              adds payment tracking fields to invoices.

-- 1) Create payment_integrations table for storing encrypted credentials
CREATE TABLE IF NOT EXISTS public.payment_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('paypal', 'stripe')),
  
  -- Common fields
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_sandbox BOOLEAN NOT NULL DEFAULT true, -- true = test mode, false = production
  
  -- Encrypted credentials (stored as encrypted text)
  -- For PayPal: client_id, client_secret
  -- For Stripe: publishable_key, secret_key
  credentials_encrypted TEXT NOT NULL,
  
  -- Webhook configuration
  webhook_secret_encrypted TEXT,
  webhook_url TEXT,
  
  -- Status and metadata
  last_verified_at TIMESTAMPTZ,
  verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'failed')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One integration per provider per company
  UNIQUE(company_id, provider)
);

-- 2) Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_integrations_company 
  ON public.payment_integrations(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_integrations_active 
  ON public.payment_integrations(company_id, provider) WHERE is_active = true;

-- 3) Enable RLS
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

-- 4) RLS Policies - only owner/admin of company can manage
DROP POLICY IF EXISTS payment_integrations_select ON public.payment_integrations;
CREATE POLICY payment_integrations_select ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND u.role IN ('owner', 'admin')
      AND u.active = true
  )
);

DROP POLICY IF EXISTS payment_integrations_insert ON public.payment_integrations;
CREATE POLICY payment_integrations_insert ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND u.role IN ('owner', 'admin')
      AND u.active = true
  )
);

DROP POLICY IF EXISTS payment_integrations_update ON public.payment_integrations;
CREATE POLICY payment_integrations_update ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND u.role IN ('owner', 'admin')
      AND u.active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND u.role IN ('owner', 'admin')
      AND u.active = true
  )
);

DROP POLICY IF EXISTS payment_integrations_delete ON public.payment_integrations;
CREATE POLICY payment_integrations_delete ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND u.role IN ('owner', 'admin')
      AND u.active = true
  )
);

-- 5) Trigger for updated_at
CREATE OR REPLACE FUNCTION update_payment_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_integrations_updated_at ON public.payment_integrations;
CREATE TRIGGER trg_payment_integrations_updated_at
BEFORE UPDATE ON public.payment_integrations
FOR EACH ROW EXECUTE FUNCTION update_payment_integrations_updated_at();

-- 6) Add payment fields to invoices table if not exists
DO $$
BEGIN
  -- payment_status: pending, partial, paid, refunded, cancelled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.invoices 
    ADD COLUMN payment_status TEXT DEFAULT 'pending' 
    CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded', 'cancelled'));
  END IF;

  -- payment_method: paypal, stripe, transfer, cash, other
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.invoices 
    ADD COLUMN payment_method TEXT 
    CHECK (payment_method IN ('paypal', 'stripe', 'transfer', 'cash', 'other', NULL));
  END IF;

  -- payment_date: when payment was received
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'payment_date'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN payment_date TIMESTAMPTZ;
  END IF;

  -- payment_reference: external transaction ID
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'payment_reference'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN payment_reference TEXT;
  END IF;

  -- payment_link_token: unique token for payment link
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'payment_link_token'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN payment_link_token TEXT UNIQUE;
  END IF;

  -- payment_link_expires_at: expiration for payment link
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'payment_link_expires_at'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN payment_link_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- 7) Create payment_transactions table for tracking individual payments
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  provider TEXT NOT NULL CHECK (provider IN ('paypal', 'stripe', 'manual')),
  external_id TEXT, -- PayPal/Stripe transaction ID
  
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  -- Metadata from provider
  provider_response JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) Indexes for payment_transactions
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice 
  ON public.payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_company 
  ON public.payment_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external 
  ON public.payment_transactions(provider, external_id);

-- 9) Enable RLS on payment_transactions
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: company members can view their transactions
DROP POLICY IF EXISTS payment_transactions_select ON public.payment_transactions;
CREATE POLICY payment_transactions_select ON public.payment_transactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_transactions.company_id
      AND u.active = true
  )
);

-- 10) Index for payment_status on invoices for quick filtering
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status 
  ON public.invoices(company_id, payment_status);

COMMENT ON TABLE public.payment_integrations IS 'Stores encrypted payment provider credentials (PayPal/Stripe) per company';
COMMENT ON TABLE public.payment_transactions IS 'Records individual payment transactions for invoices';
