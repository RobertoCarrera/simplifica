-- ========================================
-- FUNCIONES RPC PARA DESARROLLO - SUPABASE
-- ========================================
-- Este archivo contiene las funciones RPC necesarias para permitir
-- el desarrollo en modo DEV sin conflictos con Row Level Security (RLS)

-- INSTRUCCIONES:
-- 1. Ve a tu panel de Supabase (https://app.supabase.com)
-- 2. Selecciona tu proyecto
-- 3. Ve a "SQL Editor"
-- 4. Copia y pega este script completo
-- 5. Ejecuta el script haciendo clic en "Run"

-- ========================================
-- 1. FUNCIÓN: get_customers_dev
-- ========================================
-- Permite obtener clientes de un usuario específico en modo DEV
-- bypaseando las políticas RLS

CREATE OR REPLACE FUNCTION get_customers_dev(target_user_id uuid)
RETURNS TABLE (
    id uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    nombre varchar,
    apellidos varchar,
    dni varchar,
    fecha_nacimiento date,
    email varchar,
    telefono varchar,
    profesion varchar,
    empresa varchar,
    notas text,
    activo boolean,
    avatar_url text,
    direccion_id uuid,
    usuario_id uuid,
    search_vector tsvector
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.created_at,
        c.updated_at,
        c.nombre,
        c.apellidos,
        c.dni,
        c.fecha_nacimiento,
        c.email,
        c.telefono,
        c.profesion,
        c.empresa,
        c.notas,
        c.activo,
        c.avatar_url,
        c.direccion_id,
        c.usuario_id,
        c.search_vector
    FROM public.customers c
    WHERE c.usuario_id = target_user_id
    ORDER BY c.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 2. FUNCIÓN: count_customers_by_user
-- ========================================
-- Permite contar clientes por usuario para el selector DEV

CREATE OR REPLACE FUNCTION count_customers_by_user(target_user_id uuid)
RETURNS INTEGER AS $$
DECLARE
    customer_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO customer_count
    FROM public.customers c
    WHERE c.usuario_id = target_user_id;
    
    RETURN COALESCE(customer_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 3. FUNCIÓN: create_customer_dev
-- ========================================
-- Permite crear clientes asignados a un usuario específico en modo DEV

CREATE OR REPLACE FUNCTION create_customer_dev(
    target_user_id uuid,
    p_nombre varchar,
    p_apellidos varchar,
    p_email varchar,
    p_telefono varchar DEFAULT NULL,
    p_dni varchar DEFAULT NULL,
    p_fecha_nacimiento date DEFAULT NULL,
    p_profesion varchar DEFAULT NULL,
    p_empresa varchar DEFAULT NULL,
    p_notas text DEFAULT NULL,
    p_avatar_url text DEFAULT NULL,
    p_direccion_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    new_customer_id uuid;
BEGIN
    INSERT INTO public.customers (
        usuario_id,
        nombre,
        apellidos,
        email,
        telefono,
        dni,
        fecha_nacimiento,
        profesion,
        empresa,
        notas,
        avatar_url,
        direccion_id,
        activo
    ) VALUES (
        target_user_id,
        p_nombre,
        p_apellidos,
        p_email,
        p_telefono,
        p_dni,
        p_fecha_nacimiento,
        p_profesion,
        p_empresa,
        p_notas,
        p_avatar_url,
        p_direccion_id,
        true
    )
    RETURNING id INTO new_customer_id;
    
    RETURN new_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 4. FUNCIÓN: update_customer_dev
-- ========================================
-- Permite actualizar clientes en modo DEV

CREATE OR REPLACE FUNCTION update_customer_dev(
    customer_id uuid,
    target_user_id uuid,
    p_nombre varchar,
    p_apellidos varchar,
    p_email varchar,
    p_telefono varchar DEFAULT NULL,
    p_dni varchar DEFAULT NULL,
    p_fecha_nacimiento date DEFAULT NULL,
    p_profesion varchar DEFAULT NULL,
    p_empresa varchar DEFAULT NULL,
    p_notas text DEFAULT NULL,
    p_avatar_url text DEFAULT NULL,
    p_direccion_id uuid DEFAULT NULL,
    p_activo boolean DEFAULT true
)
RETURNS boolean AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE public.customers 
    SET
        nombre = p_nombre,
        apellidos = p_apellidos,
        email = p_email,
        telefono = p_telefono,
        dni = p_dni,
        fecha_nacimiento = p_fecha_nacimiento,
        profesion = p_profesion,
        empresa = p_empresa,
        notas = p_notas,
        avatar_url = p_avatar_url,
        direccion_id = p_direccion_id,
        activo = p_activo,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE 
        id = customer_id AND 
        usuario_id = target_user_id;
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 5. FUNCIÓN: delete_customer_dev
-- ========================================
-- Permite eliminar clientes en modo DEV

CREATE OR REPLACE FUNCTION delete_customer_dev(
    customer_id uuid,
    target_user_id uuid
)
RETURNS boolean AS $$
DECLARE
    deleted_rows INTEGER;
BEGIN
    DELETE FROM public.customers 
    WHERE 
        id = customer_id AND 
        usuario_id = target_user_id;
    
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    
    RETURN deleted_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 6. FUNCIÓN: get_all_users_with_customers
-- ========================================
-- Obtiene todos los usuarios que tienen clientes para el selector DEV

CREATE OR REPLACE FUNCTION get_all_users_with_customers()
RETURNS TABLE (
    user_id uuid,
    customer_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.usuario_id as user_id,
        COUNT(*) as customer_count
    FROM public.customers c
    GROUP BY c.usuario_id
    HAVING COUNT(*) > 0
    ORDER BY customer_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 7. FUNCIÓN: search_customers_dev
-- ========================================
-- Búsqueda de clientes en modo DEV con filtro por usuario

CREATE OR REPLACE FUNCTION search_customers_dev(
    target_user_id uuid,
    search_term text
)
RETURNS TABLE (
    id uuid,
    nombre varchar,
    apellidos varchar,
    email varchar,
    telefono varchar,
    created_at timestamp with time zone,
    rank real
) AS $$
BEGIN
    -- Si no hay término de búsqueda, devolver todos los clientes del usuario
    IF search_term IS NULL OR search_term = '' THEN
        RETURN QUERY
        SELECT 
            c.id,
            c.nombre,
            c.apellidos,
            c.email,
            c.telefono,
            c.created_at,
            1.0::real as rank
        FROM public.customers c
        WHERE c.usuario_id = target_user_id
        ORDER BY c.created_at DESC;
    ELSE
        -- Búsqueda con texto completo
        RETURN QUERY
        SELECT 
            c.id,
            c.nombre,
            c.apellidos,
            c.email,
            c.telefono,
            c.created_at,
            ts_rank(c.search_vector, plainto_tsquery('spanish', search_term)) as rank
        FROM public.customers c
        WHERE 
            c.usuario_id = target_user_id AND
            c.search_vector @@ plainto_tsquery('spanish', search_term)
        ORDER BY rank DESC, c.created_at DESC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 8. FUNCIÓN: get_customer_stats_dev
-- ========================================
-- Estadísticas de clientes para un usuario específico en modo DEV

CREATE OR REPLACE FUNCTION get_customer_stats_dev(target_user_id uuid)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE usuario_id = target_user_id
        ),
        'active_this_month', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE 
                usuario_id = target_user_id AND
                activo = true AND
                created_at >= date_trunc('month', CURRENT_DATE)
        ),
        'new_this_week', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE 
                usuario_id = target_user_id AND
                created_at >= date_trunc('week', CURRENT_DATE)
        ),
        'by_locality', (
            SELECT COALESCE(json_object_agg(l.name, customer_count), '{}'::json)
            FROM (
                SELECT 
                    COALESCE(l.name, 'Sin localidad') as name,
                    COUNT(c.id) as customer_count
                FROM public.customers c
                LEFT JOIN public.addresses a ON c.direccion_id = a.id
                LEFT JOIN public.localities l ON a.locality_id = l.id
                WHERE c.usuario_id = target_user_id
                GROUP BY l.name
                HAVING COUNT(c.id) > 0
            ) l
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 9. FUNCIÓN: create_address_dev
-- ========================================
-- Permite crear direcciones asignadas a un usuario específico en modo DEV

CREATE OR REPLACE FUNCTION create_address_dev(
    target_user_id uuid,
    p_direccion varchar,
    p_numero varchar DEFAULT NULL,
    p_piso varchar DEFAULT NULL,
    p_puerta varchar DEFAULT NULL,
    p_codigo_postal varchar DEFAULT NULL,
    p_locality_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    new_address_id uuid;
BEGIN
    INSERT INTO public.addresses (
        usuario_id,
        direccion,
        numero,
        piso,
        puerta,
        codigo_postal,
        locality_id
    ) VALUES (
        target_user_id,
        p_direccion,
        p_numero,
        p_piso,
        p_puerta,
        p_codigo_postal,
        p_locality_id
    )
    RETURNING id INTO new_address_id;
    
    RETURN new_address_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 10. FUNCIÓN: get_addresses_dev
-- ========================================
-- Obtiene direcciones de un usuario específico en modo DEV

CREATE OR REPLACE FUNCTION get_addresses_dev(target_user_id uuid)
RETURNS TABLE (
    id uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    direccion varchar,
    numero varchar,
    piso varchar,
    puerta varchar,
    codigo_postal varchar,
    locality_id uuid,
    usuario_id uuid
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.created_at,
        a.updated_at,
        a.direccion,
        a.numero,
        a.piso,
        a.puerta,
        a.codigo_postal,
        a.locality_id,
        a.usuario_id
    FROM public.addresses a
    WHERE a.usuario_id = target_user_id
    ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- PERMISOS Y COMENTARIOS
-- ========================================

-- Comentarios para documentar las funciones
COMMENT ON FUNCTION get_customers_dev(uuid) IS 'Función RPC para obtener clientes de un usuario específico en modo desarrollo, bypaseando RLS';
COMMENT ON FUNCTION count_customers_by_user(uuid) IS 'Función RPC para contar clientes por usuario en modo desarrollo';
COMMENT ON FUNCTION create_customer_dev IS 'Función RPC para crear clientes asignados a un usuario específico en modo desarrollo';
COMMENT ON FUNCTION update_customer_dev IS 'Función RPC para actualizar clientes en modo desarrollo';
COMMENT ON FUNCTION delete_customer_dev IS 'Función RPC para eliminar clientes en modo desarrollo';
COMMENT ON FUNCTION get_all_users_with_customers() IS 'Función RPC para obtener usuarios con clientes para el selector DEV';
COMMENT ON FUNCTION search_customers_dev IS 'Función RPC para búsqueda de clientes en modo desarrollo';
COMMENT ON FUNCTION get_customer_stats_dev(uuid) IS 'Función RPC para estadísticas de clientes en modo desarrollo';
COMMENT ON FUNCTION create_address_dev IS 'Función RPC para crear direcciones en modo desarrollo';
COMMENT ON FUNCTION get_addresses_dev(uuid) IS 'Función RPC para obtener direcciones en modo desarrollo';

-- ========================================
-- VERIFICACIÓN DE INSTALACIÓN
-- ========================================

-- Ejecuta esta query después de la instalación para verificar que las funciones se crearon correctamente:
/*
SELECT 
    routine_name,
    routine_type,
    security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%_dev%'
ORDER BY routine_name;
*/

-- ========================================
-- NOTAS IMPORTANTES
-- ========================================

/*
SEGURIDAD:
- Todas las funciones usan SECURITY DEFINER para bypassear RLS
- Solo deben usarse en desarrollo, no en producción
- Las funciones validan el usuario_id para mantener la separación de datos

USO EN LA APLICACIÓN:
- El servicio Angular utilizará estas funciones a través de .rpc()
- Permiten desarrollar y probar con múltiples usuarios sin autenticación
- Mantienen la integridad de los datos por usuario

TESTING:
- Después de ejecutar este script, prueba las funciones en SQL Editor:
  SELECT * FROM get_customers_dev('UUID_DE_USUARIO_AQUI');
  SELECT count_customers_by_user('UUID_DE_USUARIO_AQUI');
*/
