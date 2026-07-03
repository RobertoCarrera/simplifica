-- Migration: Presupuestos Fase 1 — Secciones, Anticipos, Plan de Pagos, Descuentos
-- ================================================================================
-- Compatible con RD 1619/2007 (facturación electrónica española) y RGPD.
-- NO rompe nada existente: todas las columnas nuevas son nullable o tienen default.
-- Las tablas nuevas son aditivas (no tocan quotes ni quote_items existentes).
--
-- 1. quote_sections: agrupa items por categoría (Materiales, Mano de obra, etc.)
-- 2. quote_payment_plan: define el plan de pagos de un quote aceptado
-- 3. Descuentos avanzados: columnas nuevas en quotes y quote_items
-- 4. Términos y condiciones estructurados
-- 5. Función create_invoice_for_installment (legal: factura parcial/anticipo)
-- 6. RLS en tablas nuevas
-- 7. Índices para performance

BEGIN;

-- ============================================================
-- 1. SECCIONES EN LINE ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quote_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.quote_sections(id) ON DELETE SET NULL;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'unidad';

-- ============================================================
-- 2. PLAN DE PAGOS / ANTICIPOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quote_payment_plan (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  installment_number int NOT NULL DEFAULT 1,
  description       text,
  percentage        numeric NOT NULL DEFAULT 0,
  amount            numeric NOT NULL DEFAULT 0,
  due_date          date,
  status            text NOT NULL DEFAULT 'pending',
  invoice_id        uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS has_payment_plan boolean DEFAULT false;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS deposit_type text DEFAULT 'percentage';
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0;

-- ============================================================
-- 3. DESCUENTOS AVANZADOS
-- ============================================================

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS global_discount_percent numeric DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS early_payment_discount_percent numeric DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS early_payment_days int DEFAULT 0;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'none';

-- ============================================================
-- 4. TÉRMINOS Y CONDICIONES ESTRUCTURADOS
-- ============================================================

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS payment_terms_text text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS delivery_terms text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS warranty_text text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS cancellation_policy text;

-- ============================================================
-- 5. FUNCIÓN: create_invoice_for_installment
--    Crea una factura parcial o de anticipo para un plazo del plan de pagos.
--    Cumple RD 1619/2007: numeración correlativa, referencia al quote.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_invoice_for_installment(p_installment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_plan          record;
  v_quote         record;
  v_invoice_id    uuid;
  v_series_id     uuid;
  v_next_number   int;
  v_invoice_number text;
  v_invoice_type  text;
  v_subtotal      numeric;
  v_tax_amount    numeric;
  v_total         numeric;
  v_tax_rate      numeric;
BEGIN
  -- 1. Cargar el plan y el quote
  SELECT pp.*, q.*
    INTO v_plan, v_quote
  FROM public.quote_payment_plan pp
  JOIN public.quotes q ON q.id = pp.quote_id
  WHERE pp.id = p_installment_id
    AND pp.status = 'pending';

  IF v_plan.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotencia: si ya tiene invoice_id, devolverlo
  IF v_plan.invoice_id IS NOT NULL THEN
    RETURN v_plan.invoice_id;
  END IF;

  -- 2. Determinar tipo de factura
  IF v_plan.installment_number = 1 THEN
    v_invoice_type := 'anticipo';
  ELSE
    v_invoice_type := 'partial';
  END IF;

  -- 3. Calcular importes (sobre el importe del plazo, no del total)
  v_total := v_plan.amount;
  v_tax_rate := COALESCE(
    (SELECT tax_rate FROM public.quote_items WHERE quote_id = v_quote.id ORDER BY line_number LIMIT 1),
    21
  );

  -- Si prices_include_tax, el amount del plan ya incluye IVA
  IF COALESCE(
    (SELECT prices_include_tax FROM public.company_settings WHERE company_id = v_quote.company_id),
    false
  ) THEN
    v_subtotal := ROUND(v_total / (1 + v_tax_rate / 100.0), 2);
    v_tax_amount := ROUND(v_total - v_subtotal, 2);
  ELSE
    v_subtotal := v_total;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100.0, 2);
    v_total := ROUND(v_subtotal + v_tax_amount, 2);
  END IF;

  -- 4. Obtener serie y número
  v_series_id := public.ensure_default_invoice_series(v_quote.company_id);
  SELECT COALESCE(MAX(CAST(invoice_number AS int)), 0) + 1
    INTO v_next_number
  FROM public.invoices
  WHERE company_id = v_quote.company_id AND invoice_series = 'A';
  v_invoice_number := v_next_number::text;

  -- 5. Insertar factura
  INSERT INTO public.invoices (
    company_id, client_id, series_id, invoice_number, invoice_series,
    invoice_type, invoice_date, due_date,
    subtotal, tax_amount, total, currency,
    status, payment_status, gdpr_legal_basis,
    source_quote_id, canonical_payload
  ) VALUES (
    v_quote.company_id, v_quote.client_id, v_series_id, v_invoice_number, 'A',
    v_invoice_type, COALESCE(v_plan.due_date, CURRENT_DATE), COALESCE(v_plan.due_date, CURRENT_DATE + INTERVAL '30 days'),
    v_subtotal, v_tax_amount, v_total, COALESCE(v_quote.currency, 'EUR'),
    'draft', 'pending', 'contract',
    v_quote.id, jsonb_build_object(
      'installment_id', p_installment_id,
      'installment_number', v_plan.installment_number,
      'installment_description', v_plan.description,
      'total_planned', v_quote.total_amount,
      'plan_type', v_invoice_type
    )
  )
  RETURNING id INTO v_invoice_id;

  -- 6. Insertar invoice_item (una línea que describe el plazo)
  INSERT INTO public.invoice_items (
    invoice_id, line_order, description, quantity,
    unit_price, tax_rate, tax_amount, subtotal, total
  ) VALUES (
    v_invoice_id, 1,
    COALESCE(v_plan.description, 'Factura ' || v_invoice_type) || ' — Presupuesto ' || COALESCE(v_quote.full_quote_number, v_quote.quote_number),
    1, v_subtotal, v_tax_rate, v_tax_amount, v_subtotal, v_total
  );

  -- 7. Actualizar el plan
  UPDATE public.quote_payment_plan
  SET status = 'invoiced', invoice_id = v_invoice_id, updated_at = now()
  WHERE id = p_installment_id;

  RETURN v_invoice_id;
END;
$$;

COMMENT ON FUNCTION public.create_invoice_for_installment(uuid)
  IS 'Crea una factura parcial o de anticipo para un plazo del plan de pagos. Cumple RD 1619/2007: numeración correlativa, source_quote_id, metadata con installment_number. Idempotente.';

-- ============================================================
-- 6. FUNCIÓN: generate_payment_plan
--    Genera un plan de pagos automático a partir de un quote aceptado.
--    Ej: 30% anticipo, 40% intermedio, 30% finalización.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_payment_plan(
  p_quote_id uuid,
  p_plan_config jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_quote record;
  v_config jsonb;
  v_installment jsonb;
  v_number int := 1;
  v_total numeric;
  v_amount numeric;
  v_due date;
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN RETURN; END IF;

  v_total := v_quote.total_amount;

  -- Config por defecto: 30% anticipo, 70% al finalizar
  IF p_plan_config IS NULL THEN
    v_config := jsonb_build_array(
      jsonb_build_object('description', 'Anticipo', 'percentage', 30, 'days_offset', 0),
      jsonb_build_object('description', 'Pago final', 'percentage', 70, 'days_offset', 30)
    );
  ELSE
    v_config := p_plan_config;
  END IF;

  -- Borrar plan existente si lo hay
  DELETE FROM public.quote_payment_plan WHERE quote_id = p_quote_id;

  -- Insertar cada plazo
  FOR v_installment IN SELECT * FROM jsonb_array_elements(v_config)
  LOOP
    v_amount := ROUND(v_total * (v_installment->>'percentage')::numeric / 100.0, 2);
    v_due := CURRENT_DATE + COALESCE((v_installment->>'days_offset')::int, 0);

    INSERT INTO public.quote_payment_plan (
      quote_id, company_id, installment_number, description,
      percentage, amount, due_date, status
    ) VALUES (
      p_quote_id, v_quote.company_id, v_number,
      v_installment->>'description',
      (v_installment->>'percentage')::numeric,
      v_amount, v_due, 'pending'
    );

    v_number := v_number + 1;
  END LOOP;

  -- Marcar el quote como que tiene plan de pagos
  UPDATE public.quotes SET has_payment_plan = true WHERE id = p_quote_id;
END;
$$;

COMMENT ON FUNCTION public.generate_payment_plan(uuid, jsonb)
  IS 'Genera un plan de pagos automático para un quote. Config por defecto: 30% anticipo + 70% final. Config custom: JSON array de {description, percentage, days_offset}.';

-- ============================================================
-- 7. RLS en tablas nuevas
-- ============================================================

ALTER TABLE public.quote_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_payment_plan ENABLE ROW LEVEL SECURITY;

-- quote_sections: mismo patrón que quotes
CREATE POLICY quote_sections_select ON public.quote_sections FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_sections.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer','professional'])
    )
  );

CREATE POLICY quote_sections_insert ON public.quote_sections FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_sections.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['admin','owner','supervisor','super_admin'])
    )
  );

CREATE POLICY quote_sections_update ON public.quote_sections FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_sections.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['admin','owner','supervisor','super_admin'])
    )
  );

CREATE POLICY quote_sections_delete ON public.quote_sections FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_sections.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['admin','owner','supervisor','super_admin'])
    )
  );

-- quote_payment_plan: mismo patrón
CREATE POLICY quote_payment_plan_select ON public.quote_payment_plan FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_payment_plan.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer','professional'])
    )
  );

CREATE POLICY quote_payment_plan_insert ON public.quote_payment_plan FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_payment_plan.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['admin','owner','supervisor','super_admin'])
    )
  );

CREATE POLICY quote_payment_plan_update ON public.quote_payment_plan FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_payment_plan.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['admin','owner','supervisor','super_admin'])
    )
  );

CREATE POLICY quote_payment_plan_delete ON public.quote_payment_plan FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = quote_payment_plan.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['admin','owner','supervisor','super_admin'])
    )
  );

-- ============================================================
-- 8. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_quote_sections_quote_id ON public.quote_sections(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_payment_plan_quote_id ON public.quote_payment_plan(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_payment_plan_status ON public.quote_payment_plan(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_section_id ON public.quote_items(section_id);

COMMIT;
