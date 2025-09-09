-- ============================================
-- VERIFICAR Y ARREGLAR ESTRUCTURA DE TABLA USERS
-- ============================================

-- 1. Ver la estructura actual de la tabla users
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Ver constraints actuales
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'users' AND table_schema = 'public';
