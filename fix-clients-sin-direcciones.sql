-- =====================================================
-- FIX: Clientes sin direcciones asignadas
-- =====================================================
-- PROBLEMA: Ningún cliente tiene direccion_id
-- SOLUCIÓN: Múltiples opciones según tu caso de uso
-- =====================================================

-- =====================================================
-- DIAGNÓSTICO: Ver estado actual
-- =====================================================

-- Ver clientes y sus direcciones
SELECT 
  c.id,
  c.name,
  c.email,
  c.direccion_id,
  c.company_id,
  CASE 
    WHEN c.direccion_id IS NULL THEN '❌ Sin dirección'
    ELSE '✅ Con dirección'
  END as estado
FROM clients c
WHERE c.deleted_at IS NULL
ORDER BY c.created_at DESC;

-- Ver addresses disponibles
SELECT 
  a.id,
  a.direccion,
  a.usuario_id,
  a.company_id,
  a.created_at,
  u.email as usuario_email
FROM addresses a
LEFT JOIN public.users u ON u.auth_user_id = a.usuario_id
ORDER BY a.created_at DESC;

-- =====================================================
-- OPCIÓN 1: Los clientes NO necesitan dirección física
-- =====================================================
-- Si tu app NO requiere direcciones para clientes,
-- entonces el error 400 es por las políticas RLS únicamente.
-- En este caso, solo ejecuta fix-addresses-rls-CORREGIDO.sql
-- y modifica el código Angular para manejar direcciones NULL.

-- =====================================================
-- OPCIÓN 2: Crear direcciones automáticamente
-- =====================================================
-- Si cada cliente DEBE tener una dirección,
-- podemos crear direcciones "placeholder" o desde datos existentes.

-- Ver si los clientes tienen datos de dirección en otro campo
SELECT 
  id,
  name,
  email,
  address,  -- ¿Hay datos aquí? (campo jsonb)
  metadata  -- ¿O aquí?
FROM clients
WHERE deleted_at IS NULL
LIMIT 5;

-- =====================================================
-- OPCIÓN 3: Migrar datos de clients.address (jsonb)
-- =====================================================
-- Si los clientes tienen datos en el campo `address` (jsonb),
-- podemos migrarlos a la tabla addresses

-- Primero ver qué hay en clients.address
SELECT 
  id,
  name,
  address,
  address->>'street' as calle,
  address->>'city' as ciudad,
  address->>'postal_code' as cp
FROM clients
WHERE address IS NOT NULL 
  AND address != '{}'::jsonb
LIMIT 5;

-- Si hay datos, crear función para migrar
CREATE OR REPLACE FUNCTION migrate_client_addresses()
RETURNS TABLE(
  client_id UUID,
  address_id UUID,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  client_record RECORD;
  new_address_id UUID;
  street_value TEXT;
BEGIN
  FOR client_record IN 
    SELECT 
      c.id,
      c.name,
      c.company_id,
      c.address,
      u.auth_user_id
    FROM clients c
    LEFT JOIN public.users u ON u.company_id = c.company_id
    WHERE c.direccion_id IS NULL
      AND c.deleted_at IS NULL
      AND c.address IS NOT NULL
      AND c.address != '{}'::jsonb
    LIMIT 100
  LOOP
    BEGIN
      -- Extraer calle del jsonb
      street_value := client_record.address->>'street';
      
      IF street_value IS NOT NULL AND street_value != '' THEN
        -- Crear nueva dirección
        INSERT INTO addresses (
          direccion,
          numero,
          usuario_id,
          company_id,
          created_at
        ) VALUES (
          COALESCE(street_value, 'Dirección pendiente'),
          client_record.address->>'number',
          client_record.auth_user_id,
          client_record.company_id,
          NOW()
        )
        RETURNING id INTO new_address_id;
        
        -- Asignar a cliente
        UPDATE clients
        SET direccion_id = new_address_id
        WHERE id = client_record.id;
        
        RETURN QUERY SELECT 
          client_record.id,
          new_address_id,
          TRUE,
          'Dirección migrada exitosamente'::TEXT;
      ELSE
        RETURN QUERY SELECT 
          client_record.id,
          NULL::UUID,
          FALSE,
          'No hay datos de calle en address'::TEXT;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT 
        client_record.id,
        NULL::UUID,
        FALSE,
        SQLERRM::TEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar migración (comentado por seguridad)
-- SELECT * FROM migrate_client_addresses();

-- =====================================================
-- OPCIÓN 4: Crear dirección "placeholder" por empresa
-- =====================================================
-- Crear una dirección genérica por empresa y asignarla
-- a todos los clientes que no tengan dirección

DO $$
DECLARE
  company_record RECORD;
  placeholder_address_id UUID;
  first_user_id UUID;
BEGIN
  -- Para cada empresa
  FOR company_record IN 
    SELECT DISTINCT company_id 
    FROM clients 
    WHERE deleted_at IS NULL
      AND direccion_id IS NULL
  LOOP
    -- Buscar primer usuario de la empresa
    SELECT auth_user_id INTO first_user_id
    FROM public.users
    WHERE company_id = company_record.company_id
      AND active = true
    LIMIT 1;
    
    IF first_user_id IS NOT NULL THEN
      -- Crear dirección placeholder
      INSERT INTO addresses (
        direccion,
        numero,
        usuario_id,
        company_id,
        created_at
      ) VALUES (
        'Dirección pendiente de completar',
        'S/N',
        first_user_id,
        company_record.company_id,
        NOW()
      )
      RETURNING id INTO placeholder_address_id;
      
      -- Asignar a todos los clientes sin dirección de esa empresa
      UPDATE clients
      SET direccion_id = placeholder_address_id
      WHERE company_id = company_record.company_id
        AND direccion_id IS NULL
        AND deleted_at IS NULL;
      
      RAISE NOTICE 'Empresa %: Dirección placeholder creada y asignada', company_record.company_id;
    ELSE
      RAISE WARNING 'Empresa % no tiene usuarios activos', company_record.company_id;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Ver cuántos clientes tienen dirección ahora
SELECT 
  COUNT(*) as total_clients,
  COUNT(direccion_id) as con_direccion,
  COUNT(*) - COUNT(direccion_id) as sin_direccion
FROM clients
WHERE deleted_at IS NULL;

-- Ver las direcciones creadas
SELECT 
  a.id,
  a.direccion,
  a.company_id,
  c.name as company_name,
  COUNT(cl.id) as clientes_usando_esta_direccion
FROM addresses a
LEFT JOIN companies c ON c.id = a.company_id
LEFT JOIN clients cl ON cl.direccion_id = a.id
GROUP BY a.id, a.direccion, a.company_id, c.name
ORDER BY clientes_usando_esta_direccion DESC;

-- =====================================================
-- RECOMENDACIÓN
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '💡 RECOMENDACIÓN';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
  RAISE NOTICE '1. PRIMERO ejecuta: fix-addresses-rls-CORREGIDO.sql';
  RAISE NOTICE '   Esto arregla las políticas RLS incompatibles';
  RAISE NOTICE '';
  RAISE NOTICE '2. LUEGO decide:';
  RAISE NOTICE '';
  RAISE NOTICE '   OPCIÓN A: Los clientes NO necesitan dirección';
  RAISE NOTICE '   → Modifica Angular para que direccion sea opcional';
  RAISE NOTICE '   → Cambia el select a:';
  RAISE NOTICE '     .select("*, direccion:addresses(*)") // Sin ! para LEFT JOIN';
  RAISE NOTICE '';
  RAISE NOTICE '   OPCIÓN B: Los clientes SÍ necesitan dirección';
  RAISE NOTICE '   → Ejecuta OPCIÓN 4 de este script (placeholder)';
  RAISE NOTICE '   → O migra datos si existen en clients.address';
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
