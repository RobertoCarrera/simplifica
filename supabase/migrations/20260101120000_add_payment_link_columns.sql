-- Add payment link tracking columns to invoices table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_link_token') THEN
        ALTER TABLE "public"."invoices" ADD COLUMN "payment_link_token" text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_link_expires_at') THEN
        ALTER TABLE "public"."invoices" ADD COLUMN "payment_link_expires_at" timestamp with time zone;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_link_provider') THEN
        ALTER TABLE "public"."invoices" ADD COLUMN "payment_link_provider" text;
    END IF;
END $$;
