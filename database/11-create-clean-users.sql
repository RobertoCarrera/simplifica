-- ================================================
-- SCRIPT: CREAR USUARIOS LIMPIOS
-- ================================================
-- Este script crea 2 usuarios específicos:
-- 1. Alberto Dominguez (el usuario real de SatPCGo)
-- 2. Roberto Carrera (para testing y desarrollo)

-- 1. BUSCAR/CREAR EMPRESA SATPCGO
DO $$
DECLARE
    satpcgo_company_id UUID;
    anscarr_company_id UUID;
    alberto_user_id UUID := '1e816ec8-4a5d-4e43-806a-6c7cf2ec6950'::UUID;
    alberto_company_id UUID := 'c0976b79-a10a-4e94-9f1d-f78afcdbee2a'::UUID;
    roberto_user_id UUID := 'aab570db-5165-4946-9b90-c2991d5ad183'::UUID;
    roberto_company_id UUID := '6c1a6e99-be3f-4bae-9398-3b892082c7c6'::UUID;
BEGIN
    -- Verificar si existe la empresa de Alberto
    SELECT id INTO satpcgo_company_id 
    FROM public.companies 
    WHERE id = alberto_company_id AND deleted_at IS NULL;
    
    -- Si no existe, crearla con el ID específico
    IF satpcgo_company_id IS NULL THEN
        INSERT INTO public.companies (
            id, 
            name, 
            slug, 
            website, 
            legacy_negocio_id,
            created_at, 
            updated_at
        ) VALUES (
            alberto_company_id,
            'SatPCGo',
            'satpcgo',
            'https://satpcgo.es',
            '1',
            '2024-10-30 18:07:00+00'::timestamp,
            NOW()
        );
        RAISE NOTICE 'Empresa SatPCGo creada con ID: %', alberto_company_id;
    ELSE
        RAISE NOTICE 'Empresa SatPCGo ya existe con ID: %', satpcgo_company_id;
    END IF;
    
    -- Crear/Verificar empresa para Roberto (Anscarr)
    SELECT id INTO anscarr_company_id 
    FROM public.companies 
    WHERE id = roberto_company_id AND deleted_at IS NULL;
    
    IF anscarr_company_id IS NULL THEN
        INSERT INTO public.companies (
            id,
            name, 
            slug, 
            website, 
            legacy_negocio_id,
            created_at, 
            updated_at
        ) VALUES (
            roberto_company_id,
            'Anscarr',
            'anscarr',
            'https://anscarr.es',
            '2',
            NOW(),
            NOW()
        );
        RAISE NOTICE 'Empresa Anscarr creada con ID: %', roberto_company_id;
    ELSE
        RAISE NOTICE 'Empresa Anscarr ya existe con ID: %', anscarr_company_id;
    END IF;
    
    -- 2. CREAR USUARIO 1: ALBERTO DOMINGUEZ (el real)
    INSERT INTO public.users (
        id,
        company_id,
        email,
        name,
        role,
        active,
        permissions,
        created_at,
        updated_at
    ) VALUES (
        alberto_user_id,
        alberto_company_id,
        'info@satpcgo.es',
        'Alberto Dominguez',
        'owner',
        true,
        '{"moduloFacturas": true, "moduloMaterial": true, "moduloServicios": true, "moduloPresupuestos": true}'::jsonb,
        '2024-10-30 18:07:00+00'::timestamp,
        '2025-09-08 11:18:27.934396+00'::timestamp
    ) ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        active = EXCLUDED.active,
        permissions = EXCLUDED.permissions,
        updated_at = NOW(),
        deleted_at = NULL; -- Reactivar si estaba eliminado
    
    -- 3. CREAR USUARIO 2: ROBERTO CARRERA (para desarrollo)
    INSERT INTO public.users (
        id,
        company_id,
        email,
        name,
        role,
        active,
        permissions,
        created_at,
        updated_at
    ) VALUES (
        roberto_user_id,
        roberto_company_id,
        'robertocarreratech@gmail.com',
        'Roberto Carrera Santa Maria',
        'owner',
        true,
        '{"moduloFacturas": true, "moduloMaterial": true, "moduloServicios": true, "moduloPresupuestos": true}'::jsonb,
        '2025-09-08 11:16:58.191565+00'::timestamp,
        '2025-09-08 11:18:17.682199+00'::timestamp
    ) ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        active = EXCLUDED.active,
        permissions = EXCLUDED.permissions,
        updated_at = NOW(),
        deleted_at = NULL; -- Reactivar si estaba eliminado
        
    RAISE NOTICE 'Usuarios creados correctamente';
    
END $$;

-- 4. VERIFICAR USUARIOS CREADOS
SELECT 
    '=== USUARIOS ACTIVOS ===' as seccion;

SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    c.name as company_name,
    c.website,
    u.permissions,
    u.created_at
FROM public.users u
JOIN public.companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL
ORDER BY c.name, u.name;
