-- Corregir permisos del esquema verifactu
GRANT USAGE ON SCHEMA verifactu TO postgres, anon, authenticated, service_role;

-- Garantizar permisos totales al rol de servicio (que usa la Edge Function)
GRANT ALL ON ALL TABLES IN SCHEMA verifactu TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA verifactu TO service_role;

-- Garantizar permisos a usuarios autenticados (si fuera necesario para lecturas directas)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA verifactu TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA verifactu TO authenticated;

-- Verificar si el rol service_role tiene acceso ahora
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'verifactu' AND grantee = 'service_role';
