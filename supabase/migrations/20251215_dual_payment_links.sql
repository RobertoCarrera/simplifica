-- Migration: Add support for dual payment links (Stripe + PayPal)
-- When both payment providers are configured, we want to generate links for BOTH
-- so the client can choose which method to use

-- Add new columns for storing both payment URLs
DO $$ 
BEGIN
  -- Stripe payment URL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'stripe_payment_url'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN stripe_payment_url TEXT;
    COMMENT ON COLUMN public.invoices.stripe_payment_url IS 'Direct Stripe checkout URL for this invoice';
  END IF;

  -- PayPal payment URL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'paypal_payment_url'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN paypal_payment_url TEXT;
    COMMENT ON COLUMN public.invoices.paypal_payment_url IS 'Direct PayPal approval URL for this invoice';
  END IF;

  -- Stripe payment token (separate from main token for unique tracking)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'stripe_payment_token'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN stripe_payment_token TEXT UNIQUE;
    COMMENT ON COLUMN public.invoices.stripe_payment_token IS 'Unique token for Stripe payment tracking';
  END IF;

  -- PayPal payment token (separate from main token for unique tracking)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'paypal_payment_token'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN paypal_payment_token TEXT UNIQUE;
    COMMENT ON COLUMN public.invoices.paypal_payment_token IS 'Unique token for PayPal payment tracking';
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_token ON public.invoices(stripe_payment_token) WHERE stripe_payment_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_paypal_token ON public.invoices(paypal_payment_token) WHERE paypal_payment_token IS NOT NULL;

-- Note: The existing payment_link_token, payment_link_provider, payment_link_expires_at columns
-- are kept for backward compatibility. The new columns store the actual URLs directly.
