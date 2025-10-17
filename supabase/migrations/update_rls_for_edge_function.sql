-- =====================================================
-- ACTUALIZACIÓN: Simplificar RLS para Edge Function
-- =====================================================
-- Ahora que hide-stage Edge Function maneja la validación,
-- las políticas RLS pueden ser simples
-- =====================================================

-- 1. Eliminar cualquier función RPC anterior (si existiera)
DROP FUNCTION IF EXISTS hide_stage_for_company(UUID);
DROP FUNCTION IF EXISTS unhide_stage_for_company(UUID);

-- 2. Las políticas RLS ya existen y están correctas
-- Solo necesitan verificar company_id, no validar si es genérico
-- (La Edge Function hace esa validación)

-- Verificar que las políticas existen
DO $$
BEGIN
  -- Verificar SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'hidden_stages' 
    AND policyname = 'Users can view their company hidden stages'
  ) THEN
    CREATE POLICY "Users can view their company hidden stages" ON hidden_stages
      FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM users WHERE id = auth.uid()
        )
      );
    RAISE NOTICE 'Created SELECT policy for hidden_stages';
  ELSE
    RAISE NOTICE 'SELECT policy already exists';
  END IF;

  -- Verificar INSERT policy (simplificada)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'hidden_stages' 
    AND policyname = 'Users can hide generic stages for their company'
  ) THEN
    CREATE POLICY "Users can hide generic stages for their company" ON hidden_stages
      FOR INSERT
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM users WHERE id = auth.uid()
        )
      );
    RAISE NOTICE 'Created INSERT policy for hidden_stages';
  ELSE
    RAISE NOTICE 'INSERT policy already exists';
  END IF;

  -- Verificar DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'hidden_stages' 
    AND policyname = 'Users can unhide generic stages for their company'
  ) THEN
    CREATE POLICY "Users can unhide generic stages for their company" ON hidden_stages
      FOR DELETE
      USING (
        company_id IN (
          SELECT company_id FROM users WHERE id = auth.uid()
        )
      );
    RAISE NOTICE 'Created DELETE policy for hidden_stages';
  ELSE
    RAISE NOTICE 'DELETE policy already exists';
  END IF;
END $$;

-- 3. Actualizar comentarios para reflejar que la Edge Function maneja la validación
COMMENT ON POLICY "Users can hide generic stages for their company" ON hidden_stages 
IS 'Permite a usuarios insertar registros de estados ocultos. La validación de que el stage sea genérico se hace en la Edge Function hide-stage.';

COMMENT ON POLICY "Users can unhide generic stages for their company" ON hidden_stages 
IS 'Permite a usuarios eliminar registros de estados ocultos. La Edge Function hide-stage maneja la lógica de negocio.';

-- 4. Actualizar descripción de la tabla
COMMENT ON TABLE hidden_stages 
IS 'Almacena qué estados genéricos del sistema ha ocultado cada empresa. Las operaciones se gestionan mediante la Edge Function hide-stage que valida y escribe con service_role.';

-- 5. Info para el desarrollador
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ RLS policies simplificadas correctamente';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Políticas activas en hidden_stages:';
  RAISE NOTICE '  • SELECT: Ver estados ocultos de tu empresa';
  RAISE NOTICE '  • INSERT: Insertar (usado por Edge Function con service_role)';
  RAISE NOTICE '  • DELETE: Eliminar (usado por Edge Function con service_role)';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Seguridad:';
  RAISE NOTICE '  • Las políticas verifican solo company_id';
  RAISE NOTICE '  • La Edge Function hide-stage hace validación completa';
  RAISE NOTICE '  • Service role bypass RLS de forma segura';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Siguiente paso:';
  RAISE NOTICE '  • Desplegar Edge Function: bash deploy-hide-stage.sh';
  RAISE NOTICE '  • Configurar variables de entorno en Supabase Dashboard';
  RAISE NOTICE '  • Probar desde Angular UI';
  RAISE NOTICE '';
END $$;
