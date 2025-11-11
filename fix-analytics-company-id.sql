-- SOLUCIÓN RÁPIDA: Modificar get_user_company_id() para leer de tabla
-- Ejecuta este script en Supabase SQL Editor para corregir el error inmediatamente

-- Reemplazar función para leer company_id desde tabla users en lugar de JWT
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Leer company_id de la tabla users usando auth.uid()
  SELECT company_id 
  INTO v_company_id
  FROM public.users
  WHERE auth_user_id = auth.uid();
  
  -- Validar que el usuario tenga company_id asignado
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User % does not have company_id assigned', auth.uid()
      USING HINT = 'Check users table for auth_user_id = ' || auth.uid()::text;
  END IF;
  
  RETURN v_company_id;
END;
$$;

-- Comentario: Esta versión evita la dependencia del JWT claim custom
-- y funciona inmediatamente sin configurar Auth Hooks.
-- Performance: Agrega 1 lookup extra a users (cache efectivo con índice existente).

-- Verificar que funciona
SELECT public.get_user_company_id() AS my_company_id;
-- Debe retornar tu company_id (no error)

-- Probar función analytics
SELECT * FROM f_quote_kpis_monthly(NULL, NULL);
-- Debe retornar datos (no error "Missing company_id")
