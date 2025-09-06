-- =============================================
-- ASEGURAR QUE TODAS LAS EMPRESAS EXISTEN
-- =============================================

-- Función para crear las empresas que faltan
CREATE OR REPLACE FUNCTION ensure_all_companies()
RETURNS TEXT AS $$
DECLARE
    result_text TEXT := '';
    michinanny_id UUID;
    satpcgo_id UUID;
    libera_id UUID;
    empresa_count INTEGER;
BEGIN
    result_text := result_text || '=== VERIFICANDO EMPRESAS EXISTENTES ===' || E'\n';
    
    -- Contar empresas actuales
    SELECT COUNT(*) INTO empresa_count FROM companies WHERE deleted_at IS NULL;
    result_text := result_text || 'Empresas actuales en BD: ' || empresa_count::text || E'\n\n';
    
    -- Mostrar empresas existentes
    result_text := result_text || '📋 Empresas existentes:' || E'\n';
    FOR michinanny_id IN 
        SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY name
    LOOP
        SELECT name INTO result_text FROM companies WHERE id = michinanny_id;
        result_text := result_text || '  ✅ ' || (SELECT name FROM companies WHERE id = michinanny_id) || ' (ID: ' || michinanny_id::text || ')' || E'\n';
    END LOOP;
    
    result_text := result_text || E'\n=== CREANDO EMPRESAS FALTANTES ===' || E'\n';
    
    -- Verificar y crear SatPCGo
    SELECT id INTO satpcgo_id FROM companies WHERE name = 'SatPCGo' AND deleted_at IS NULL;
    IF satpcgo_id IS NULL THEN
        INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'SatPCGo',
            'satpcgo.com',
            1, -- ID del negocio original
            NOW(),
            NOW()
        )
        RETURNING id INTO satpcgo_id;
        
        result_text := result_text || '✅ SatPCGo creado: ' || satpcgo_id::text || E'\n';
    ELSE
        result_text := result_text || '✅ SatPCGo ya existe: ' || satpcgo_id::text || E'\n';
    END IF;
    
    -- Verificar y crear Michinanny
    SELECT id INTO michinanny_id FROM companies WHERE name = 'Michinanny' AND deleted_at IS NULL;
    IF michinanny_id IS NULL THEN
        INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Michinanny',
            'michinanny.com',
            2, -- Nuevo negocio
            NOW(),
            NOW()
        )
        RETURNING id INTO michinanny_id;
        
        result_text := result_text || '✅ Michinanny creado: ' || michinanny_id::text || E'\n';
    ELSE
        result_text := result_text || '✅ Michinanny ya existe: ' || michinanny_id::text || E'\n';
    END IF;
    
    -- Verificar y crear Libera Tus Creencias
    SELECT id INTO libera_id FROM companies WHERE name = 'Libera Tus Creencias' AND deleted_at IS NULL;
    IF libera_id IS NULL THEN
        INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Libera Tus Creencias',
            'liberatuscreencias.com',
            3, -- Nuevo negocio
            NOW(),
            NOW()
        )
        RETURNING id INTO libera_id;
        
        result_text := result_text || '✅ Libera Tus Creencias creado: ' || libera_id::text || E'\n';
    ELSE
        result_text := result_text || '✅ Libera Tus Creencias ya existe: ' || libera_id::text || E'\n';
    END IF;
    
    -- Resumen final
    result_text := result_text || E'\n=== RESUMEN ===' || E'\n';
    SELECT COUNT(*) INTO empresa_count FROM companies WHERE deleted_at IS NULL;
    result_text := result_text || 'Total empresas en BD: ' || empresa_count::text || E'\n';
    result_text := result_text || 'SatPCGo ID: ' || satpcgo_id::text || E'\n';
    result_text := result_text || 'Michinanny ID: ' || michinanny_id::text || E'\n';
    result_text := result_text || 'Libera Tus Creencias ID: ' || libera_id::text || E'\n';
    result_text := result_text || E'\n✅ Todas las empresas están disponibles' || E'\n';
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar la verificación/creación
SELECT ensure_all_companies();
