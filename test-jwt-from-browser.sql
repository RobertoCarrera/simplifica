-- ============================================================
-- TEST: Verificar company_id en JWT desde navegador
-- ============================================================
-- Este test debe ejecutarse desde el SQL Editor con tu sesión activa

-- 1. Verificar que la función auxiliar existe
SELECT 'Función existe' as test,
       public.get_company_id_from_jwt() as company_id_from_jwt;

-- 2. Verificar auth.uid() 
SELECT 'Auth UID' as test,
       auth.uid() as user_id;

-- 3. Verificar JWT completo
SELECT 'JWT completo' as test,
       auth.jwt() as jwt_data;

-- 4. Probar extracción de company_id de diferentes formas
SELECT 'Extracción directa' as test,
       (auth.jwt() -> 'company_id')::text as company_id_text,
       (auth.jwt() -> 'company_id')::text::uuid as company_id_uuid;
