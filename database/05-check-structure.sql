-- Script simple para probar migración paso a paso

-- 1. Verificar tablas existentes
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('companies', 'users', 'clients');

-- 2. Mostrar estructura de users
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND table_schema = 'public';

-- 3. Contar registros actuales
SELECT 
    (SELECT COUNT(*) FROM companies) as companies_count,
    (SELECT COUNT(*) FROM users) as users_count,
    (SELECT COUNT(*) FROM clients) as clients_count;
