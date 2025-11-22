-- =====================================================
-- INVOICE SERIES - Setup & Maintenance Scripts
-- =====================================================
-- Este archivo contiene scripts SQL para inicializar y mantener 
-- las series de facturación en la base de datos de Supabase.

-- =====================================================
-- 1. Crear serie por defecto para empresas sin ninguna serie
-- =====================================================
-- Ejecutar SOLO UNA VEZ al inicio, o cuando detectes que alguna
-- empresa no tiene series configuradas

INSERT INTO invoice_series (company_id, series_code, series_name, year, prefix, next_number, is_active, is_default, verifactu_enabled)
SELECT 
  c.id,
  'A',
  'Serie principal',
  EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  '',
  1,
  TRUE,
  TRUE,
  FALSE
FROM companies c
LEFT JOIN invoice_series s ON s.company_id = c.id AND s.is_default = TRUE
WHERE s.id IS NULL;

-- =====================================================
-- 2. Asegurar que solo haya UNA serie por defecto por empresa
-- =====================================================
-- Si tienes múltiples series marcadas como por defecto para una 
-- misma empresa, este script deja solo la más reciente activa

WITH ranked AS (
  SELECT 
    id,
    company_id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id 
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM invoice_series
  WHERE is_default = TRUE
)
UPDATE invoice_series s
SET is_default = (r.rn = 1)
FROM ranked r
WHERE s.id = r.id;

-- =====================================================
-- 3. Ver estado actual de series por empresa
-- =====================================================
-- Query de diagnóstico para verificar el estado de tus series

SELECT 
  c.name AS empresa,
  s.series_code AS codigo,
  s.series_name AS nombre,
  s.year AS año,
  s.prefix AS prefijo,
  s.next_number AS siguiente_numero,
  s.is_active AS activa,
  s.is_default AS por_defecto,
  s.verifactu_enabled AS verifactu,
  s.updated_at AS actualizado
FROM invoice_series s
JOIN companies c ON c.id = s.company_id
ORDER BY c.name, s.is_default DESC, s.series_code;

-- =====================================================
-- 4. Detectar empresas SIN serie por defecto activa
-- =====================================================
-- Este query devuelve las empresas que causarían el error 400
-- al intentar convertir un presupuesto a factura

SELECT 
  c.id,
  c.name AS empresa,
  COUNT(s.id) FILTER (WHERE s.is_active = TRUE) AS series_activas,
  COUNT(s.id) FILTER (WHERE s.is_default = TRUE AND s.is_active = TRUE) AS series_default_activas
FROM companies c
LEFT JOIN invoice_series s ON s.company_id = c.id
GROUP BY c.id, c.name
HAVING COUNT(s.id) FILTER (WHERE s.is_default = TRUE AND s.is_active = TRUE) = 0
ORDER BY c.name;

-- =====================================================
-- 5. Cambiar la serie por defecto de una empresa específica
-- =====================================================
-- Reemplaza <COMPANY_ID> y <NUEVA_SERIE_ID> con los valores reales

-- Paso 1: Desmarcar todas las series de esa empresa
-- UPDATE invoice_series 
-- SET is_default = FALSE
-- WHERE company_id = '<COMPANY_ID>';

-- Paso 2: Marcar la nueva serie por defecto (y asegurar que esté activa)
-- UPDATE invoice_series
-- SET is_default = TRUE, is_active = TRUE
-- WHERE id = '<NUEVA_SERIE_ID>';

-- =====================================================
-- 6. Crear una nueva serie para una empresa específica
-- =====================================================
-- Reemplaza <COMPANY_ID>, 'B', 'Serie 2025'... con tus valores

-- INSERT INTO invoice_series (
--   company_id,
--   series_code,
--   series_name,
--   year,
--   prefix,
--   next_number,
--   is_active,
--   is_default,
--   verifactu_enabled
-- ) VALUES (
--   '<COMPANY_ID>',
--   'B',
--   'Serie 2025',
--   2025,
--   'FAC',
--   1,
--   TRUE,
--   FALSE,  -- si quieres que sea por defecto, pon TRUE (pero recuerda que solo puede haber una)
--   FALSE
-- );

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- 
-- * Cada empresa DEBE tener AL MENOS UNA serie activa y marcada
--   como is_default = TRUE para poder convertir presupuestos a facturas.
--
-- * Solo puede haber UNA serie por defecto por empresa.
--
-- * El RPC get_next_invoice_number(p_series_id) incrementa automáticamente
--   el campo next_number al usarse, por lo que no necesitas actualizar
--   manualmente ese número.
--
-- * El sistema respeta las RLS policies: cada empresa solo ve sus propias series.
--
-- * Si usas VeriFactu, las facturas de series con verifactu_enabled = TRUE
--   se encadenarán y firmarán digitalmente.
--
