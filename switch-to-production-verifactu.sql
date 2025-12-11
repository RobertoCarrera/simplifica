-- ============================================================
-- CAMBIAR VERIFACTU A PRODUCCIÓN
-- ============================================================
-- ADVERTENCIA: Solo ejecutar cuando:
-- 1. Hayas probado todo en preproducción
-- 2. Tengas el certificado DE PRODUCCIÓN de AEAT
-- 3. Estés listo para emitir facturas reales
-- ============================================================

BEGIN;

-- Cambiar a producción
UPDATE public.verifactu_settings
SET 
  environment = 'prod',
  updated_at = NOW()
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

-- Verificar cambio
SELECT 
  company_id,
  software_code,
  issuer_nif,
  environment as entorno,
  CASE 
    WHEN environment = 'prod' THEN '🔴 PRODUCCIÓN - Facturas reales ante AEAT'
    WHEN environment = 'pre' THEN '🟡 PREPRODUCCIÓN - Entorno de pruebas'
    ELSE '⚪ Desconocido'
  END as estado,
  updated_at as actualizado
FROM public.verifactu_settings
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

COMMIT;
