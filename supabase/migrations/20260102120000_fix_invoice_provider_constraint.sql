-- Drop the restrictive check constraint on payment_link_provider
-- It currently only allows 'stripe' and 'paypal', but we need 'multiple' and potentially others.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'invoices_payment_link_provider_check'
        AND table_name = 'invoices'
    ) THEN
        ALTER TABLE "public"."invoices" DROP CONSTRAINT "invoices_payment_link_provider_check";
    END IF;
END $$;
