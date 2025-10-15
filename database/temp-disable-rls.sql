-- ============================================================================
-- EMERGENCIA: Deshabilitar RLS temporalmente
-- ============================================================================
-- ⚠️ ADVERTENCIA: Esto deshabilitará la seguridad temporalmente
-- ⚠️ Solo usar para diagnóstico, re-habilitar inmediatamente después

-- Deshabilitar RLS en clients, services y tickets
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE services DISABLE ROW LEVEL SECURITY;
ALTER TABLE tickets DISABLE ROW LEVEL SECURITY;

-- Verificar que se deshabilitó
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('clients', 'services', 'tickets')
ORDER BY tablename;

-- ============================================================================
-- DESPUÉS DE ESTO:
-- 1. Refresca el navegador (F5)
-- 2. ¿Ves ahora los datos?
-- 3. Si SÍ, el problema es RLS
-- 4. Si NO, el problema es otra cosa
-- ============================================================================
