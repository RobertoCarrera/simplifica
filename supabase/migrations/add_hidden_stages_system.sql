-- =====================================================
-- MIGRATION: Sistema de Estados Ocultos
-- =====================================================
-- Permite a las empresas ocultar estados genéricos del sistema
-- que no deseen utilizar en su workflow
-- =====================================================

-- 1. Crear tabla para guardar estados ocultos por empresa
CREATE TABLE IF NOT EXISTS hidden_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES ticket_stages(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Constraint para evitar duplicados
  UNIQUE(company_id, stage_id)
);

-- 2. Añadir índices para mejorar performance
CREATE INDEX idx_hidden_stages_company ON hidden_stages(company_id);
CREATE INDEX idx_hidden_stages_stage ON hidden_stages(stage_id);
CREATE INDEX idx_hidden_stages_company_stage ON hidden_stages(company_id, stage_id);

-- 3. Añadir comentarios para documentación
COMMENT ON TABLE hidden_stages IS 'Almacena qué estados genéricos del sistema ha ocultado cada empresa';
COMMENT ON COLUMN hidden_stages.company_id IS 'ID de la empresa que oculta el estado';
COMMENT ON COLUMN hidden_stages.stage_id IS 'ID del estado genérico que se oculta (debe tener company_id = NULL)';
COMMENT ON COLUMN hidden_stages.hidden_at IS 'Fecha y hora en que se ocultó el estado';
COMMENT ON COLUMN hidden_stages.hidden_by IS 'Usuario que ocultó el estado';

-- 4. Habilitar Row Level Security
ALTER TABLE hidden_stages ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS para hidden_stages

-- Política SELECT: Los usuarios pueden ver los estados ocultos de su empresa
DROP POLICY IF EXISTS "Users can view their company hidden stages" ON hidden_stages;
CREATE POLICY "Users can view their company hidden stages" ON hidden_stages
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Política INSERT: Los usuarios pueden ocultar estados para su empresa
-- Nota: La verificación de que sea genérico se hace en el servicio, no en RLS
DROP POLICY IF EXISTS "Users can hide generic stages for their company" ON hidden_stages;
CREATE POLICY "Users can hide generic stages for their company" ON hidden_stages
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Política DELETE: Los usuarios pueden mostrar (des-ocultar) estados genéricos
DROP POLICY IF EXISTS "Users can unhide generic stages for their company" ON hidden_stages;
CREATE POLICY "Users can unhide generic stages for their company" ON hidden_stages
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- 6. Función helper para verificar si un estado está oculto para una empresa
CREATE OR REPLACE FUNCTION is_stage_hidden_for_company(
  p_stage_id UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM hidden_stages
    WHERE stage_id = p_stage_id
      AND company_id = p_company_id
  );
END;
$$;

COMMENT ON FUNCTION is_stage_hidden_for_company IS 'Verifica si un estado genérico está oculto para una empresa específica';

-- 7. Vista para obtener estados visibles por empresa
CREATE OR REPLACE VIEW visible_stages_by_company AS
SELECT 
  ts.*,
  c.id as viewing_company_id,
  CASE 
    WHEN ts.company_id IS NULL THEN 'generic'
    WHEN ts.company_id = c.id THEN 'company'
    ELSE 'other'
  END as stage_type,
  CASE 
    WHEN hs.id IS NOT NULL THEN true
    ELSE false
  END as is_hidden
FROM ticket_stages ts
CROSS JOIN companies c
LEFT JOIN hidden_stages hs ON (
  hs.stage_id = ts.id 
  AND hs.company_id = c.id
  AND ts.company_id IS NULL  -- Solo aplicar a estados genéricos
)
WHERE 
  -- Incluir estados genéricos no ocultos
  (ts.company_id IS NULL AND hs.id IS NULL)
  OR
  -- Incluir estados de la empresa
  ts.company_id = c.id;

COMMENT ON VIEW visible_stages_by_company IS 'Vista que muestra los estados visibles para cada empresa (genéricos no ocultos + propios)';

-- 8. Grants de permisos
GRANT SELECT ON hidden_stages TO authenticated;
GRANT INSERT ON hidden_stages TO authenticated;
GRANT DELETE ON hidden_stages TO authenticated;
GRANT SELECT ON visible_stages_by_company TO authenticated;
GRANT EXECUTE ON FUNCTION is_stage_hidden_for_company TO authenticated;
