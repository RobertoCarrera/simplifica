-- ============================================================================
-- RESTAURAR get_user_company_id() A VERSIÓN JWT (PRODUCCIÓN)
-- ============================================================================
-- Ahora que el Auth Hook está activo e inyecta company_id en el JWT,
-- revertimos la función a su versión original que lee del token.
-- Esto elimina el SELECT extra a la tabla users y usa la arquitectura óptima.
--
-- PREREQUISITO: Edge Function 'custom-access-token' desplegada y configurada
--               como Auth Hook en Supabase Dashboard.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
DECLARE
  jwt jsonb;
  cid text;
BEGIN
  -- Leer JWT claims del contexto de la petición
  jwt := COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
  
  -- Extraer company_id del custom claim (agregado por Auth Hook)
  cid := NULLIF((jwt ->> 'company_id'), '');
  
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Missing company_id in JWT claims'
      USING HINT = 'Ensure Auth Hook is configured and user has logged in after activation';
  END IF;
  
  RETURN cid::uuid;
END;
$$;

-- Verificar que la función se creó correctamente
COMMENT ON FUNCTION public.get_user_company_id() IS 
'Returns company_id from JWT custom claim (injected by custom-access-token Auth Hook). Used by all analytics functions for company-level filtering.';

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1. Verificar que el token actual incluye company_id:
--    Ir a jwt.io y pegar tu access_token de Supabase
--    Buscar en el payload: "company_id": "uuid-here"
--
-- 2. Test la función (debe retornar tu company_id):
--    SELECT public.get_user_company_id();
--
-- 3. Test los RPCs analytics:
--    SELECT * FROM f_quote_kpis_monthly(NULL, NULL);
--    SELECT * FROM f_quote_projected_revenue(NULL, NULL);
--
-- Si obtienes error "Missing company_id in JWT claims":
-- - Cierra sesión en tu app
-- - Inicia sesión de nuevo (esto genera un nuevo token con el claim)
-- - Verifica en jwt.io que el nuevo token incluye company_id
-- ============================================================================
