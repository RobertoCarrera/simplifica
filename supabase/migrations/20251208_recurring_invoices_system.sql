-- ============================================================
-- MIGRACIÓN: Soporte para facturación recurrente automática
-- ============================================================
-- Este script:
-- 1. Asegura que la columna source_quote_id existe en invoices
-- 2. Añade índice para vincular facturas a presupuestos
-- 3. Actualiza la función de KPIs de facturas para evitar duplicados
-- ============================================================

-- 1. Asegurar que source_quote_id existe
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS source_quote_id uuid REFERENCES public.quotes(id);

-- Índice para buscar facturas por presupuesto origen
CREATE INDEX IF NOT EXISTS idx_invoices_source_quote_id 
  ON public.invoices(source_quote_id) 
  WHERE source_quote_id IS NOT NULL;

-- 2. Añadir columna para tracking de período de facturación recurrente
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS recurrence_period varchar(7); -- formato: YYYY-MM

COMMENT ON COLUMN public.invoices.recurrence_period IS 
  'Para facturas generadas de presupuestos recurrentes, indica el período (YYYY-MM)';

-- 3. Actualizar la función de KPIs de facturas
-- Ahora lee SOLO de invoices (ya que los recurrentes generan facturas reales)
CREATE OR REPLACE FUNCTION public.f_invoice_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
  period_month date,
  invoices_count bigint,
  paid_count bigint,
  pending_count bigint,
  overdue_count bigint,
  cancelled_count bigint,
  draft_count bigint,
  subtotal_sum numeric,
  tax_sum numeric,
  total_sum numeric,
  collected_sum numeric,
  pending_sum numeric,
  paid_total_sum numeric,
  receivable_sum numeric,
  avg_invoice_value numeric,
  collection_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH 
  -- Facturas reales de la tabla invoices (incluye las generadas desde recurrentes)
  real_invoices AS (
    SELECT 
      i.company_id,
      i.created_by,
      DATE_TRUNC('month', i.invoice_date)::date as period_month,
      i.status,
      COALESCE(i.subtotal, 0) as subtotal,
      COALESCE(i.tax_amount, 0) as tax_amount,
      COALESCE(i.total, i.total_amount, 0) as total_amount,
      COALESCE(i.paid_amount, 0) as paid_amount
    FROM public.invoices i
    WHERE i.company_id = public.get_company_id_from_jwt()
      AND i.deleted_at IS NULL
  ),
  -- FALLBACK: Presupuestos recurrentes que NO tienen factura generada aún
  -- (para compatibilidad con datos históricos antes de implementar la generación automática)
  legacy_recurring AS (
    SELECT 
      q.company_id,
      q.created_by,
      DATE_TRUNC('month', q.last_run_at)::date as period_month,
      'paid' as status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      COALESCE(q.total_amount, 0) as paid_amount
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.deleted_at IS NULL
      AND q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.last_run_at IS NOT NULL
      -- Solo incluir si NO existe factura real para este período
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.source_quote_id = q.id
          AND DATE_TRUNC('month', inv.invoice_date)::date = DATE_TRUNC('month', q.last_run_at)::date
          AND inv.deleted_at IS NULL
      )
  ),
  -- Primera facturación de recurrentes (si no hay factura para ese mes)
  legacy_first_invoice AS (
    SELECT 
      q.company_id,
      q.created_by,
      DATE_TRUNC('month', q.invoiced_at)::date as period_month,
      'paid' as status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      COALESCE(q.total_amount, 0) as paid_amount
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.deleted_at IS NULL
      AND q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.invoiced_at IS NOT NULL
      -- Solo si es diferente del mes de last_run_at
      AND (q.last_run_at IS NULL OR DATE_TRUNC('month', q.invoiced_at)::date != DATE_TRUNC('month', q.last_run_at)::date)
      -- Y no existe factura real para ese período
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.source_quote_id = q.id
          AND DATE_TRUNC('month', inv.invoice_date)::date = DATE_TRUNC('month', q.invoiced_at)::date
          AND inv.deleted_at IS NULL
      )
  ),
  -- Combinar todas las fuentes
  all_invoices AS (
    SELECT * FROM real_invoices
    UNION ALL
    SELECT * FROM legacy_recurring
    UNION ALL
    SELECT * FROM legacy_first_invoice
  ),
  -- Filtrar por rango de fechas
  filtered_invoices AS (
    SELECT *
    FROM all_invoices
    WHERE (p_start IS NULL OR period_month >= p_start)
      AND (p_end IS NULL OR period_month <= p_end)
  )
  SELECT 
    fi.company_id,
    fi.created_by,
    fi.period_month,
    COUNT(*)::bigint as invoices_count,
    COUNT(*) FILTER (WHERE fi.status = 'paid')::bigint as paid_count,
    COUNT(*) FILTER (WHERE fi.status IN ('sent', 'pending', 'viewed', 'approved'))::bigint as pending_count,
    COUNT(*) FILTER (WHERE fi.status = 'overdue')::bigint as overdue_count,
    COUNT(*) FILTER (WHERE fi.status = 'cancelled')::bigint as cancelled_count,
    COUNT(*) FILTER (WHERE fi.status = 'draft')::bigint as draft_count,
    COALESCE(SUM(fi.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(fi.tax_amount), 0) as tax_sum,
    COALESCE(SUM(fi.total_amount), 0) as total_sum,
    COALESCE(SUM(fi.paid_amount), 0) as collected_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status IN ('sent', 'pending', 'viewed', 'approved')), 0) as pending_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status = 'paid'), 0) as paid_total_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status IN ('sent', 'pending', 'viewed', 'overdue', 'approved')), 0) as receivable_sum,
    AVG(fi.total_amount) as avg_invoice_value,
    (COUNT(*) FILTER (WHERE fi.status = 'paid')::numeric / NULLIF(COUNT(*), 0)) as collection_rate
  FROM filtered_invoices fi
  GROUP BY fi.company_id, fi.created_by, fi.period_month
  ORDER BY fi.period_month DESC;
$$;

COMMENT ON FUNCTION public.f_invoice_kpis_monthly(date, date) IS 
'Retorna KPIs de facturas mensuales.
Lee de la tabla invoices (facturas reales) + fallback para presupuestos recurrentes históricos
que aún no tienen factura generada. Evita duplicados verificando si ya existe factura real.';


-- ============================================================
-- 4. Script para generar facturas históricas de recurrentes
-- ============================================================
-- Este bloque genera facturas reales para presupuestos recurrentes existentes
-- que ya tenían last_run_at pero no tenían factura en invoices

DO $$
DECLARE
  rec RECORD;
  v_series_id uuid;
  v_next_number text;
  v_invoice_id uuid;
  v_invoice_series text;
  v_full_number text;
BEGIN
  -- Buscar presupuestos recurrentes con last_run_at pero sin factura para ese período
  FOR rec IN 
    SELECT 
      q.id as quote_id,
      q.company_id,
      q.client_id,
      q.full_quote_number,
      q.subtotal,
      q.tax_amount,
      q.total_amount,
      q.currency,
      q.created_by,
      q.last_run_at,
      DATE_TRUNC('month', q.last_run_at)::date as period_month
    FROM public.quotes q
    WHERE q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.last_run_at IS NOT NULL
      AND q.deleted_at IS NULL
      -- No existe factura para este período
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.source_quote_id = q.id
          AND inv.deleted_at IS NULL
      )
  LOOP
    BEGIN
      -- Obtener serie por defecto
      SELECT id, year || '-' || series_code INTO v_series_id, v_invoice_series
      FROM public.invoice_series
      WHERE company_id = rec.company_id
        AND is_active = true
        AND is_default = true
      ORDER BY year DESC
      LIMIT 1;

      IF v_series_id IS NULL THEN
        RAISE NOTICE 'No hay serie de factura para company_id %', rec.company_id;
        CONTINUE;
      END IF;

      -- Obtener siguiente número
      SELECT public.get_next_invoice_number(v_series_id) INTO v_next_number;
      
      IF v_next_number IS NULL THEN
        RAISE NOTICE 'No se pudo generar número de factura para quote %', rec.quote_id;
        CONTINUE;
      END IF;

      v_full_number := v_invoice_series || '-' || v_next_number;

      -- Crear factura
      INSERT INTO public.invoices (
        company_id, client_id, series_id, invoice_number, invoice_series,
        full_invoice_number, invoice_type, invoice_date, invoice_month,
        due_date, subtotal, tax_amount, total, currency, status, payment_status,
        notes, created_by, source_quote_id, recurrence_period
      ) VALUES (
        rec.company_id, rec.client_id, v_series_id, v_next_number, v_invoice_series,
        v_full_number, 'normal', rec.last_run_at::date, rec.period_month,
        (rec.last_run_at + INTERVAL '30 days')::date, rec.subtotal, rec.tax_amount,
        rec.total_amount, COALESCE(rec.currency, 'EUR'), 'paid', 'paid',
        'Factura recurrente (migración histórica) desde: ' || rec.full_quote_number,
        rec.created_by, rec.quote_id, TO_CHAR(rec.last_run_at, 'YYYY-MM')
      )
      RETURNING id INTO v_invoice_id;

      -- Copiar items
      INSERT INTO public.invoice_items (
        invoice_id, line_order, description, quantity, unit_price,
        discount_percent, tax_rate, tax_amount, subtotal, total
      )
      SELECT 
        v_invoice_id, qi.line_number, qi.description, qi.quantity, qi.unit_price,
        COALESCE(qi.discount_percent, 0), qi.tax_rate, qi.tax_amount, qi.subtotal, qi.total
      FROM public.quote_items qi
      WHERE qi.quote_id = rec.quote_id
      ORDER BY qi.line_number;

      RAISE NOTICE 'Creada factura % para quote %', v_full_number, rec.full_quote_number;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error procesando quote %: %', rec.quote_id, SQLERRM;
    END;
  END LOOP;
END $$;

-- También para invoiced_at (primera facturación)
DO $$
DECLARE
  rec RECORD;
  v_series_id uuid;
  v_next_number text;
  v_invoice_id uuid;
  v_invoice_series text;
  v_full_number text;
BEGIN
  FOR rec IN 
    SELECT 
      q.id as quote_id,
      q.company_id,
      q.client_id,
      q.full_quote_number,
      q.subtotal,
      q.tax_amount,
      q.total_amount,
      q.currency,
      q.created_by,
      q.invoiced_at,
      DATE_TRUNC('month', q.invoiced_at)::date as period_month
    FROM public.quotes q
    WHERE q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.invoiced_at IS NOT NULL
      AND q.deleted_at IS NULL
      -- El mes de invoiced_at es diferente de last_run_at
      AND (q.last_run_at IS NULL OR DATE_TRUNC('month', q.invoiced_at) != DATE_TRUNC('month', q.last_run_at))
      -- No existe factura para este período
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.source_quote_id = q.id
          AND DATE_TRUNC('month', inv.invoice_date) = DATE_TRUNC('month', q.invoiced_at)
          AND inv.deleted_at IS NULL
      )
  LOOP
    BEGIN
      SELECT id, year || '-' || series_code INTO v_series_id, v_invoice_series
      FROM public.invoice_series
      WHERE company_id = rec.company_id
        AND is_active = true
        AND is_default = true
      ORDER BY year DESC
      LIMIT 1;

      IF v_series_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT public.get_next_invoice_number(v_series_id) INTO v_next_number;
      IF v_next_number IS NULL THEN
        CONTINUE;
      END IF;

      v_full_number := v_invoice_series || '-' || v_next_number;

      INSERT INTO public.invoices (
        company_id, client_id, series_id, invoice_number, invoice_series,
        full_invoice_number, invoice_type, invoice_date, invoice_month,
        due_date, subtotal, tax_amount, total, currency, status, payment_status,
        notes, created_by, source_quote_id, recurrence_period
      ) VALUES (
        rec.company_id, rec.client_id, v_series_id, v_next_number, v_invoice_series,
        v_full_number, 'normal', rec.invoiced_at::date, rec.period_month,
        (rec.invoiced_at + INTERVAL '30 days')::date, rec.subtotal, rec.tax_amount,
        rec.total_amount, COALESCE(rec.currency, 'EUR'), 'paid', 'paid',
        'Factura inicial recurrente (migración) desde: ' || rec.full_quote_number,
        rec.created_by, rec.quote_id, TO_CHAR(rec.invoiced_at, 'YYYY-MM')
      )
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.invoice_items (
        invoice_id, line_order, description, quantity, unit_price,
        discount_percent, tax_rate, tax_amount, subtotal, total
      )
      SELECT 
        v_invoice_id, qi.line_number, qi.description, qi.quantity, qi.unit_price,
        COALESCE(qi.discount_percent, 0), qi.tax_rate, qi.tax_amount, qi.subtotal, qi.total
      FROM public.quote_items qi
      WHERE qi.quote_id = rec.quote_id
      ORDER BY qi.line_number;

      RAISE NOTICE 'Creada factura inicial % para quote %', v_full_number, rec.full_quote_number;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error procesando quote inicial %: %', rec.quote_id, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================
-- 5. Verificación
-- ============================================================
SELECT 
  'FACTURAS GENERADAS' as check_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE source_quote_id IS NOT NULL) as from_quotes,
  COUNT(*) FILTER (WHERE recurrence_period IS NOT NULL) as recurring
FROM public.invoices
WHERE deleted_at IS NULL;

SELECT 
  full_invoice_number,
  invoice_date,
  status,
  total,
  source_quote_id,
  recurrence_period
FROM public.invoices
WHERE source_quote_id IS NOT NULL
  AND deleted_at IS NULL
ORDER BY invoice_date DESC
LIMIT 20;
