-- ============================================================
-- Add Holded accounting integration
-- 2026-03-26
-- ============================================================

-- 1. holded_integrations table (company-scoped, one row per company)
CREATE TABLE public.holded_integrations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  api_key_encrypted    text        NOT NULL,
  is_active            boolean     NOT NULL DEFAULT false,
  verification_status  text        NOT NULL DEFAULT 'pending'
                         CHECK (verification_status IN ('pending', 'verified', 'failed')),
  connected_at         timestamptz,
  last_verified_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.holded_integrations IS 'Stores encrypted Holded API key per company. api_key_encrypted is AES-256-GCM and never exposed to the client.';
COMMENT ON COLUMN public.holded_integrations.api_key_encrypted IS 'AES-256-GCM encrypted Holded API key — only decryptable server-side via ENCRYPTION_KEY env var.';

ALTER TABLE public.holded_integrations ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated member of the company (read status only; encrypted column worthless without server key)
CREATE POLICY "holded_integrations_select" ON public.holded_integrations
  FOR SELECT USING (
    company_id IN (
      SELECT cm.company_id
      FROM   public.company_members cm
      WHERE  cm.user_id = public.get_my_user_id()
    )
  );

-- ALL write operations: owner/admin only (same pattern as other company resources)
CREATE POLICY "holded_integrations_write" ON public.holded_integrations
  FOR ALL
  USING      (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

-- Index for fast per-company lookups
CREATE INDEX idx_holded_integrations_company_id ON public.holded_integrations(company_id);

-- ─────────────────────────────────────────────────────────────
-- 2. bookings table: add holded_invoice_id for traceability
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS holded_invoice_id text;

COMMENT ON COLUMN public.bookings.holded_invoice_id IS
  'Holded salesreceipt document ID after booking confirmation + payment. Null = not yet sent to Holded.';

-- ─────────────────────────────────────────────────────────────
-- 3. DB trigger: notify holded-booking-invoice edge function
--    Fires AFTER INSERT or UPDATE when a booking transitions
--    to status='confirmed' AND payment_status='paid' for the
--    first time (holded_invoice_id is still NULL).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_holded_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_url      text;
  v_role_key text;
BEGIN
  -- Gate: must be the first time this booking reaches confirmed+paid
  IF     NEW.status          = 'confirmed'
     AND NEW.payment_status  = 'paid'
     AND NEW.holded_invoice_id IS NULL
     AND (
           TG_OP = 'INSERT'
           OR OLD.status         IS DISTINCT FROM 'confirmed'
           OR OLD.payment_status IS DISTINCT FROM 'paid'
         )
  THEN
    v_url      := current_setting('app.supabase_url',              true);
    v_role_key := current_setting('app.supabase_service_role_key', true);

    IF v_url IS NOT NULL AND v_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/holded-booking-invoice',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_role_key
        ),
        body    := jsonb_build_object('booking_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_holded_booking_confirmed ON public.bookings;
CREATE TRIGGER trg_holded_booking_confirmed
  AFTER INSERT OR UPDATE OF status, payment_status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_holded_booking_confirmed();

NOTIFY pgrst, 'reload schema';
