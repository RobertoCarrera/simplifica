-- Add payment_link_provider column to invoices table
-- This stores which provider (paypal/stripe) was used for the payment link

DO $$
BEGIN
  -- Add payment_link_provider column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'invoices' 
      AND column_name = 'payment_link_provider'
  ) THEN
    ALTER TABLE public.invoices 
    ADD COLUMN payment_link_provider TEXT 
    CHECK (payment_link_provider IN ('paypal', 'stripe'));
    
    COMMENT ON COLUMN public.invoices.payment_link_provider IS 'Payment provider used for the payment link (paypal or stripe)';
  END IF;
END $$;
