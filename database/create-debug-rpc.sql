-- ============================================================================
-- Crear función RPC para debug de auth.uid()
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_user_context()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'auth_uid', auth.uid(),
    'user_exists', EXISTS(SELECT 1 FROM users WHERE auth_user_id = auth.uid()),
    'user_data', (
      SELECT json_build_object(
        'id', id,
        'email', email,
        'name', name,
        'company_id', company_id,
        'role', role,
        'active', active
      )
      FROM users
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    ),
    'company_context', (
      SELECT json_build_object(
        'auth_user_id', auth_user_id,
        'company_id', company_id,
        'role', role
      )
      FROM user_company_context
      LIMIT 1
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Test inmediato
SELECT get_current_user_context();

-- ============================================================================
-- Esta función devolverá null en SQL Editor (porque no hay auth.uid())
-- Pero funcionará correctamente desde la aplicación
-- ============================================================================
