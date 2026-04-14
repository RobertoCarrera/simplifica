-- ============================================================
-- Migration: Auto-generate quote from booking
-- Features:
--   1. Add professional_id + booking_id to quotes table
--   2. Add booking_id to quote_items table
--   3. Create quote_generation_logs for diagnostics
--   4. Create RPC function to generate quote from booking
--   5. RLS: owner sees all quotes, professional sees only theirs
-- ============================================================

-- ============================================================
-- STEP 1: Extend quotes table
-- ============================================================
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'::text,
  ADD COLUMN IF NOT EXISTS generation_log_id uuid;

COMMENT ON COLUMN public.quotes.professional_id IS 'Professional who created the quote (for RLS filtering)';
COMMENT ON COLUMN public.quotes.booking_id IS 'Booking from which this quote was auto-generated (NULL = manual)';
COMMENT ON COLUMN public.quotes.source IS 'Quote origin: manual, booking_auto, api, etc.';

-- ============================================================
-- STEP 2: Extend quote_items table
-- ============================================================
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_item_id uuid;  -- Reserved for future booking_items linking

COMMENT ON COLUMN public.quote_items.booking_id IS 'Booking from which this quote line was generated';

-- ============================================================
-- STEP 3: Create quote_generation_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quote_generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'success', 'failed', 'partial')),
  trigger_source text NOT NULL DEFAULT 'booking_pipeline',
  professional_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON NULL,
  error_message text,
  input_payload jsonb,
  output_payload jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

COMMENT ON TABLE public.quote_generation_logs IS 'Audit log for quote auto-generation from bookings';

CREATE INDEX IF NOT EXISTS idx_quote_gen_logs_booking_id ON public.quote_generation_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_quote_gen_logs_company_id ON public.quote_generation_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_quote_gen_logs_status ON public.quote_generation_logs(status);
CREATE INDEX IF NOT EXISTS idx_quote_gen_logs_created_at ON public.quote_generation_logs(created_at DESC);

-- ============================================================
-- STEP 4: Create RPC function to generate quote from booking
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_quote_from_booking(
  p_booking_id uuid,
  p_trigger_source text DEFAULT 'booking_pipeline'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with invoker privileges for RLS
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_quote_id uuid;
  v_company_id uuid;
  v_client_id uuid;
  v_professional_id uuid;
  v_service_id uuid;
  v_service_name text;
  v_service_price numeric;
  v_service_tax_rate numeric;
  v_booking_data record;
  v_seq integer;
  v_result jsonb;
  v_error_msg text;
BEGIN
  -- Create audit log entry
  INSERT INTO public.quote_generation_logs (company_id, booking_id, status, trigger_source, input_payload)
  VALUES (NULL, p_booking_id, 'started', p_trigger_source,
          jsonb_build_object('booking_id', p_booking_id, 'trigger', p_trigger_source))
  RETURNING id INTO v_log_id;

  BEGIN
    -- Fetch booking data with company and client info
    SELECT
      b.company_id,
      b.customer_email,
      b.professional_id,
      b.service_id,
      bt.name AS service_name,
      bt.price AS service_price,
      bt.tax_rate AS service_tax_rate,
      c.id AS client_id
    INTO v_booking_data
    FROM public.bookings b
    LEFT JOIN public.booking_types bt ON bt.id = b.service_id
    LEFT JOIN public.clients c ON c.email = b.customer_email
      AND c.company_id = b.company_id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking not found: %', p_booking_id;
    END IF;

    v_company_id := v_booking_data.company_id;
    v_client_id := v_booking_data.client_id;
    v_professional_id := v_booking_data.professional_id;
    v_service_id := v_booking_data.service_id;
    v_service_name := COALESCE(v_booking_data.service_name, 'Servicio');
    v_service_price := COALESCE(v_booking_data.service_price, 0);
    v_service_tax_rate := COALESCE(v_booking_data.service_tax_rate, 21);

    -- If no client found by email, try to find by email within company
    IF v_client_id IS NULL AND v_booking_data.customer_email IS NOT NULL THEN
      SELECT id INTO v_client_id
      FROM public.clients
      WHERE company_id = v_company_id
        AND (email = v_booking_data.customer_email OR contact_email = v_booking_data.customer_email)
      LIMIT 1;
    END IF;

    -- If still no client, use a placeholder (the booking itself links to client by email)
    -- Get next sequence number for quote_number
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
    FROM public.quotes
    WHERE company_id = v_company_id
      AND year = EXTRACT(year FROM CURRENT_DATE);

    -- Create the quote
    INSERT INTO public.quotes (
      company_id, client_id, quote_number, year, sequence_number,
      status, quote_date, valid_until,
      professional_id, booking_id, source,
      generation_log_id, created_at
    ) VALUES (
      v_company_id,
      COALESCE(v_client_id, '00000000-0000-0000-0000-000000000000'::uuid),  -- placeholder if no client
      'QT-' || EXTRACT(year FROM CURRENT_DATE) || '-' || LPAD(v_seq::text, 5, '0'),
      EXTRACT(year FROM CURRENT_DATE)::integer,
      v_seq,
      'draft',
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '30 days',
      v_professional_id,
      p_booking_id,
      'booking_auto',
      v_log_id,
      now()
    )
    RETURNING id INTO v_quote_id;

    -- Create quote line item from service
    IF v_service_id IS NOT NULL THEN
      INSERT INTO public.quote_items (
        quote_id, company_id, service_id, description,
        quantity, unit_price, tax_rate, billing_period,
        subtotal, tax_amount, total, line_number,
        booking_id
      ) VALUES (
        v_quote_id,
        v_company_id,
        v_service_id,
        v_service_name,
        1,
        v_service_price,
        v_service_tax_rate,
        NULL,
        v_service_price,                                    -- subtotal (pre-tax)
        ROUND(v_service_price * v_service_tax_rate / 100, 2),  -- tax_amount
        v_service_price + ROUND(v_service_price * v_service_tax_rate / 100, 2),  -- total
        1,
        p_booking_id
      );
    END IF;

    -- Update log with success
    UPDATE public.quote_generation_logs
    SET status = 'success',
        company_id = v_company_id,
        client_id = v_client_id,
        professional_id = v_professional_id,
        quote_id = v_quote_id,
        completed_at = now(),
        output_payload = jsonb_build_object(
          'quote_id', v_quote_id,
          'quote_number', 'QT-' || EXTRACT(year FROM CURRENT_DATE) || '-' || LPAD(v_seq::text, 5, '0'),
          'client_id', v_client_id,
          'service_name', v_service_name
        )
    WHERE id = v_log_id;

    -- Update quote with log reference
    UPDATE public.quotes SET generation_log_id = v_log_id WHERE id = v_quote_id;

    v_result := jsonb_build_object(
      'success', true,
      'quote_id', v_quote_id,
      'log_id', v_log_id
    );

    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    -- Log failure
    UPDATE public.quote_generation_logs
    SET status = 'failed',
        error_message = v_error_msg,
        completed_at = now()
    WHERE id = v_log_id;

    -- Also update quote as failed if it was created
    UPDATE public.quotes SET status = 'cancelled' WHERE id = v_quote_id AND status = 'draft';

    RETURN jsonb_build_object(
      'success', false,
      'error', v_error_msg,
      'log_id', v_log_id
    );
  END;
END;
$$;

-- Grant execute to authenticated users (RLS handles access)
GRANT EXECUTE ON FUNCTION public.generate_quote_from_booking(uuid, text) TO authenticated;

-- ============================================================
-- STEP 5: Update RLS policies for quotes
-- ============================================================

-- Drop old policies
DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy" ON public.quotes;

-- SELECT: Owner sees all, professional sees only theirs (via professional_id or company membership)
CREATE POLICY "quotes_select_policy" ON public.quotes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.company_id = quotes.company_id
              AND cm.status = 'active'
        )
        OR
        -- Professional can see quotes where they are the assigned professional
        quotes.professional_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- INSERT: via RPC function only (not direct insert)
CREATE POLICY "quotes_insert_policy" ON public.quotes
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.company_id = quotes.company_id
              AND cm.status = 'active'
        )
    );

-- UPDATE: owner can update all, professional only their own
CREATE POLICY "quotes_update_policy" ON public.quotes
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.company_id = quotes.company_id
              AND cm.status = 'active'
        )
        OR
        quotes.professional_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.company_id = quotes.company_id
              AND cm.status = 'active'
        )
    );

-- DELETE: owner/admin only
CREATE POLICY "quotes_delete_policy" ON public.quotes
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.company_id = quotes.company_id
              AND cm.status = 'active'
              AND cm.role IN ('owner', 'admin')
        )
    );

-- Enable RLS on new columns
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_generation_logs ENABLE ROW LEVEL SECURITY;

-- Quote items: owner sees all items in company, professional sees items of their quotes
DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
CREATE POLICY "quote_items_select_policy" ON public.quote_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.company_id = quote_items.company_id
              AND cm.status = 'active'
        )
        OR
        -- Items of quotes assigned to this professional
        EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
              AND q.professional_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    );

-- Quote generation logs: owner sees all in company, professional sees their own
DROP POLICY IF EXISTS "quote_gen_logs_select_policy" ON public.quote_generation_logs;
CREATE POLICY "quote_gen_logs_select_policy" ON public.quote_generation_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.company_id = quote_generation_logs.company_id
              AND cm.status = 'active'
              AND cm.role IN ('owner', 'admin')
        )
        OR
        quote_generation_logs.professional_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- ============================================================
-- STEP 6: Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quotes_professional_id ON public.quotes(professional_id);
CREATE INDEX IF NOT EXISTS idx_quotes_booking_id ON public.quotes(booking_id);
CREATE INDEX IF NOT EXISTS idx_quotes_source ON public.quotes(source);
CREATE INDEX IF NOT EXISTS idx_quote_items_booking_id ON public.quote_items(booking_id);
