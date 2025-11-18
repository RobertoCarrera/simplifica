-- Invoices immutability & RLS hardening (review before applying in prod)
-- Safe to run in a transaction; adjust schema names if needed.

BEGIN;

-- 1) Enable RLS if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables t
    JOIN pg_namespace n ON n.oid = t.schemaname::regnamespace
    WHERE n.nspname = 'public' AND t.tablename = 'invoices'
  ) THEN
    RAISE NOTICE 'Table public.invoices not found. Skipping.';
  ELSE
    EXECUTE 'ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY';
  END IF;
END$$;

-- 2) Prevent UPDATE/DELETE after finalize using a trigger (append-only after closure)
CREATE OR REPLACE FUNCTION public.prevent_invoice_update_after_finalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'INVOICE_FINALIZED_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_invoice_update_after_finalize'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_prevent_invoice_update_after_finalize
      BEFORE UPDATE OR DELETE ON public.invoices
      FOR EACH ROW EXECUTE FUNCTION public.prevent_invoice_update_after_finalize()';
  END IF;
END$$;

-- 3) RLS policy: allow updates only when invoice not finalized and company matches JWT
--    Adjust role names as per your setup.
CREATE POLICY IF NOT EXISTS invoices_update_unfinalized
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  finalized_at IS NULL
  AND company_id::text = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'company_id','')
);

-- 4) (Optional) Canonical hash storage & constraint placeholders
--    Compute canonical JSON + SHA-256 during finalize (in RPC finalize_invoice) and store in:
--      - invoices.hash_prev (text)
--      - invoices.hash_current (text)
--      - invoices.canonical_payload (jsonb)
--    Add uniqueness/indexes as required for audit.
--    This file does not define the columns as schema may already contain them.

COMMIT;
