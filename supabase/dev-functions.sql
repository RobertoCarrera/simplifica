-- ========================================
-- FUNCIONES PARA MODO DESARROLLO
-- ========================================
-- Estas funciones permiten bypasear RLS para testing en desarrollo

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
SECURITY DEFINER -- Ejecuta con privilegios de superusuario
AS $$
BEGIN
  -- Si se proporciona usuario_id, filtrar por él
  IF p_usuario_id IS NOT NULL THEN
    RETURN QUERY
    SELECT c.* FROM public.customers c
    WHERE c.usuario_id = p_usuario_id
    ORDER BY c.created_at DESC;
  ELSE
    -- Si no se proporciona usuario, devolver todos
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

-- Función para obtener todos los usuarios con conteo de clientes
CREATE OR REPLACE FUNCTION get_users_with_customer_counts()
RETURNS TABLE(
  user_id uuid,
  customer_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.usuario_id as user_id,
    COUNT(*) as customer_count
  FROM public.customers c
  GROUP BY c.usuario_id
  ORDER BY customer_count DESC;
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
  -- Crear el cliente
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
