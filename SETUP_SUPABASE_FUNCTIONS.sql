-- ===============================================
-- INSTRUCCIONES PARA APLICAR EN SUPABASE
-- ===============================================
-- Copia este código y ejecútalo en el SQL Editor de Supabase
-- (https://app.supabase.com → Tu proyecto → SQL Editor)

-- ========================================
-- FUNCIONES PARA MODO DESARROLLO
-- ========================================

-- Función para obtener clientes por usuario (bypasa RLS)
CREATE OR REPLACE FUNCTION get_customers_dev(p_usuario_id uuid DEFAULT NULL)
RETURNS TABLE(
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
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_usuario_id IS NOT NULL THEN
    RETURN QUERY
    SELECT c.* FROM public.customers c
    WHERE c.usuario_id = p_usuario_id
    ORDER BY c.created_at DESC;
  ELSE
    RETURN QUERY
    SELECT c.* FROM public.customers c
    ORDER BY c.created_at DESC;
  END IF;
END;
$$;

-- Función para contar clientes por usuario (bypasa RLS)
CREATE OR REPLACE FUNCTION count_customers_by_user(p_usuario_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  customer_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO customer_count
  FROM public.customers
  WHERE usuario_id = p_usuario_id;
  
  RETURN customer_count;
END;
$$;

-- Función para crear cliente en modo DEV (bypasa RLS)
CREATE OR REPLACE FUNCTION create_customer_dev(
  p_nombre varchar,
  p_apellidos varchar,
  p_email varchar,
  p_telefono varchar DEFAULT NULL,
  p_dni varchar DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_customer_id uuid;
BEGIN
  INSERT INTO public.customers (
    nombre,
    apellidos,
    email,
    telefono,
    dni,
    usuario_id,
    activo
  ) VALUES (
    p_nombre,
    p_apellidos,
    p_email,
    p_telefono,
    p_dni,
    p_usuario_id,
    true
  )
  RETURNING id INTO new_customer_id;
  
  RETURN new_customer_id;
END;
$$;

-- ========================================
-- VERIFICAR INSTALACIÓN
-- ========================================
-- Ejecuta esta consulta para verificar que las funciones se instalaron correctamente:
-- SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%_dev' OR routine_name LIKE 'count_customers_by_user';

-- ========================================
-- TESTING
-- ========================================
-- Prueba las funciones:
-- SELECT * FROM get_customers_dev();
-- SELECT count_customers_by_user('1e816ec8-4a5d-4e43-806a-6c7cf2ec6950');
