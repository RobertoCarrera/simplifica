-- =====================================================
-- FIX: Actualizar políticas RLS de hidden_stages
-- =====================================================
-- Este script corrige el problema con la política de INSERT
-- que causaba el error 403 Forbidden
-- =====================================================

-- Eliminar política INSERT anterior
DROP POLICY IF EXISTS "Users can hide generic stages for their company" ON hidden_stages;

-- Crear nueva política INSERT (sin verificación de stage genérico en RLS)
-- La verificación se hace en el servicio antes de insertar
CREATE POLICY "Users can hide generic stages for their company" ON hidden_stages
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Comentar la razón del cambio
COMMENT ON POLICY "Users can hide generic stages for their company" ON hidden_stages 
IS 'Permite a usuarios insertar registros de estados ocultos para su empresa. La validación de que el stage sea genérico se hace en el servicio.';
