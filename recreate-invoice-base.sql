-- ============================================================
-- Script para VERIFICAR y RECREAR invoice_base
-- ============================================================
-- Este script verifica si invoice_base existe y la recrea si es necesario

-- 1. Verificar si existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'analytics' AND table_name = 'invoice_base'
  ) THEN
    RAISE NOTICE '✓ La vista invoice_base existe';
  ELSE
    RAISE NOTICE '✗ La vista invoice_base NO existe';
  END IF;
END $$;

-- 2. Recrear la vista
DROP VIEW IF EXISTS analytics.invoice_base CASCADE;

CREATE OR REPLACE VIEW analytics.invoice_base AS
SELECT
  i.id AS invoice_id,
  i.company_id AS company_id,
  i.created_by AS created_by,
  i.client_id AS client_id,
  COALESCE(i.subtotal, 0)::numeric AS subtotal,
  COALESCE(i.tax_amount, 0)::numeric AS tax_amount,
  COALESCE(i.total, 0)::numeric AS total_amount,
  COALESCE(i.paid_amount, 0)::numeric AS paid_amount,
  (COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0))::numeric AS pending_amount,
  i.status AS status,
  i.invoice_type AS invoice_type,
  i.invoice_date AS invoice_date,
  i.due_date AS due_date,
  i.invoice_month AS period_month,
  (CASE 
    WHEN i.status = 'paid' THEN 0
    WHEN i.due_date < CURRENT_DATE THEN -(CURRENT_DATE - i.due_date)
    ELSE (i.due_date - CURRENT_DATE)
  END)::integer AS days_to_due,
  (i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'cancelled', 'draft')) AS is_overdue
FROM public.invoices i
WHERE i.deleted_at IS NULL;

-- 3. Verificar que se creó correctamente
SELECT 
  'Vista recreada' as info,
  COUNT(*) as filas_en_vista
FROM analytics.invoice_base;

-- 4. Muestra de datos en la vista
SELECT 
  'Muestra invoice_base' as info,
  invoice_id,
  company_id,
  created_by,
  period_month,
  total_amount,
  status
FROM analytics.invoice_base
ORDER BY invoice_date DESC
LIMIT 5;
