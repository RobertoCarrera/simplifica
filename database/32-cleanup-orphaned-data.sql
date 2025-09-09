-- 32-cleanup-orphaned-data.sql
-- Elimina datos huérfanos y relaciones rotas detectadas
-- REVISAR ANTES DE EJECUTAR - HACE CAMBIOS PERMANENTES

-- IMPORTANTE: Ejecutar script 30 primero para detectar problemas

DO $$
DECLARE
  orphan_count INTEGER;
  cleanup_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== CLEANUP: Eliminando datos huérfanos ===';
  
  -- ================================================================
  -- 1. ELIMINAR SERVICE_TAG_RELATIONS HUÉRFANAS
  -- ================================================================
  
  -- Relaciones que apuntan a servicios eliminados/inexistentes
  SELECT COUNT(*) INTO orphan_count
  FROM service_tag_relations str
  WHERE NOT EXISTS (
    SELECT 1 FROM services s 
    WHERE s.id = str.service_id 
    AND s.deleted_at IS NULL
  );
  
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Eliminando % service_tag_relations con servicios inexistentes', orphan_count;
    DELETE FROM service_tag_relations str
    WHERE NOT EXISTS (
      SELECT 1 FROM services s 
      WHERE s.id = str.service_id 
      AND s.deleted_at IS NULL
    );
    cleanup_count := cleanup_count + orphan_count;
  END IF;
  
  -- Relaciones que apuntan a tags inexistentes/inactivos
  SELECT COUNT(*) INTO orphan_count
  FROM service_tag_relations str
  WHERE NOT EXISTS (
    SELECT 1 FROM service_tags st 
    WHERE st.id = str.tag_id 
    AND st.is_active = true
  );
  
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Eliminando % service_tag_relations con tags inexistentes/inactivos', orphan_count;
    DELETE FROM service_tag_relations str
    WHERE NOT EXISTS (
      SELECT 1 FROM service_tags st 
      WHERE st.id = str.tag_id 
      AND st.is_active = true
    );
    cleanup_count := cleanup_count + orphan_count;
  END IF;
  
  -- ================================================================
  -- 2. ELIMINAR TICKET_TAG_RELATIONS HUÉRFANAS
  -- ================================================================
  
  -- Solo si existe la tabla ticket_tag_relations
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ticket_tag_relations') THEN
    
    -- Relaciones que apuntan a tickets eliminados
    SELECT COUNT(*) INTO orphan_count
    FROM ticket_tag_relations ttr
    WHERE NOT EXISTS (
      SELECT 1 FROM tickets t 
      WHERE t.id = ttr.ticket_id 
      AND t.deleted_at IS NULL
    );
    
    IF orphan_count > 0 THEN
      RAISE NOTICE 'Eliminando % ticket_tag_relations con tickets inexistentes', orphan_count;
      DELETE FROM ticket_tag_relations ttr
      WHERE NOT EXISTS (
        SELECT 1 FROM tickets t 
        WHERE t.id = ttr.ticket_id 
        AND t.deleted_at IS NULL
      );
      cleanup_count := cleanup_count + orphan_count;
    END IF;
    
    -- Relaciones que apuntan a tags inexistentes
    SELECT COUNT(*) INTO orphan_count
    FROM ticket_tag_relations ttr
    WHERE NOT EXISTS (
      SELECT 1 FROM service_tags st 
      WHERE st.id = ttr.tag_id 
      AND st.is_active = true
    );
    
    IF orphan_count > 0 THEN
      RAISE NOTICE 'Eliminando % ticket_tag_relations con tags inexistentes', orphan_count;
      DELETE FROM ticket_tag_relations ttr
      WHERE NOT EXISTS (
        SELECT 1 FROM service_tags st 
        WHERE st.id = ttr.tag_id 
        AND st.is_active = true
      );
      cleanup_count := cleanup_count + orphan_count;
    END IF;
  END IF;
  
  -- ================================================================
  -- 3. ELIMINAR SERVICE_TAGS HUÉRFANOS
  -- ================================================================
  
  -- Tags que apuntan a companies inexistentes
  SELECT COUNT(*) INTO orphan_count
  FROM service_tags st
  WHERE NOT EXISTS (
    SELECT 1 FROM companies c 
    WHERE c.id = st.company_id 
    AND c.deleted_at IS NULL
  );
  
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Eliminando % service_tags con companies inexistentes', orphan_count;
    DELETE FROM service_tags st
    WHERE NOT EXISTS (
      SELECT 1 FROM companies c 
      WHERE c.id = st.company_id 
      AND c.deleted_at IS NULL
    );
    cleanup_count := cleanup_count + orphan_count;
  END IF;
  
  -- ================================================================
  -- 4. ELIMINAR DUPLICADOS EN SERVICE_TAGS
  -- ================================================================
  
  -- Mantener solo el más reciente de cada duplicado (name, company_id)
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY name, company_id 
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM service_tags
  )
  SELECT COUNT(*) INTO orphan_count
  FROM duplicates
  WHERE rn > 1;
  
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Eliminando % service_tags duplicados', orphan_count;
    
    -- Primero eliminar relaciones a los duplicados que vamos a borrar
    DELETE FROM service_tag_relations 
    WHERE tag_id IN (
      SELECT id FROM (
        SELECT 
          id,
          ROW_NUMBER() OVER (
            PARTITION BY name, company_id 
            ORDER BY created_at DESC, id DESC
          ) AS rn
        FROM service_tags
      ) duplicates
      WHERE rn > 1
    );
    
    -- Luego eliminar los duplicados
    DELETE FROM service_tags 
    WHERE id IN (
      SELECT id FROM (
        SELECT 
          id,
          ROW_NUMBER() OVER (
            PARTITION BY name, company_id 
            ORDER BY created_at DESC, id DESC
          ) AS rn
        FROM service_tags
      ) duplicates
      WHERE rn > 1
    );
    
    cleanup_count := cleanup_count + orphan_count;
  END IF;
  
  -- ================================================================
  -- RESUMEN
  -- ================================================================
  RAISE NOTICE '=== Limpieza completada: % registros eliminados ===', cleanup_count;
  
  -- Estadísticas post-limpieza
  SELECT COUNT(*) INTO orphan_count FROM service_tags;
  RAISE NOTICE 'Service tags restantes: %', orphan_count;
  
  SELECT COUNT(*) INTO orphan_count FROM service_tag_relations;
  RAISE NOTICE 'Service tag relations restantes: %', orphan_count;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ticket_tag_relations') THEN
    SELECT COUNT(*) INTO orphan_count FROM ticket_tag_relations;
    RAISE NOTICE 'Ticket tag relations restantes: %', orphan_count;
  END IF;
  
END$$;
