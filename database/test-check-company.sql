-- Test para verificar si la función check_company_exists funciona
SELECT 'Testing check_company_exists function' as test;

-- Si funciona, debería retornar información de empresas existentes
SELECT * FROM check_company_exists('Digitalizamos tu PYME');
SELECT * FROM check_company_exists('nonexistent company');
