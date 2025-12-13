-- ============================================================================
-- VERIFICACIÓN DE SEGURIDAD - CLIENT PORTAL
-- ============================================================================
-- Script para verificar que las políticas RLS funcionan correctamente
-- y que los clientes solo pueden acceder a sus propios datos.
-- ============================================================================

-- ============================================================================
-- 1. VERIFICAR QUE RLS ESTÁ HABILITADO
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tickets', 'quotes', 'invoices', 'clients', 'ticket_stages', 'quote_items', 'invoice_items')
ORDER BY tablename;

-- ============================================================================
-- 2. LISTAR TODAS LAS POLÍTICAS DE CLIENTES
-- ============================================================================

SELECT 
  tablename,
  policyname,
  cmd as "Operation",
  qual as "USING clause",
  with_check as "WITH CHECK clause"
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%clients_can%'
ORDER BY tablename, cmd, policyname;

-- ============================================================================
-- 3. VERIFICAR CLIENTES CON auth_user_id
-- ============================================================================

SELECT 
  id,
  company_id,
  name,
  email,
  auth_user_id,
  is_active,
  created_at
FROM public.clients
WHERE auth_user_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- 4. VERIFICAR DATOS ASIGNADOS A CLIENTES CON auth_user_id
-- ============================================================================

-- Tickets del cliente portal
SELECT 
  'tickets' as table_name,
  t.id,
  t.title,
  t.client_id,
  c.name as client_name,
  c.email as client_email,
  c.auth_user_id
FROM public.tickets t
JOIN public.clients c ON c.id = t.client_id
WHERE c.auth_user_id IS NOT NULL
LIMIT 5;

-- Presupuestos del cliente portal
SELECT 
  'quotes' as table_name,
  q.id,
  q.quote_number,
  q.client_id,
  c.name as client_name,
  c.email as client_email,
  c.auth_user_id,
  q.status,
  q.recurrence_type
FROM public.quotes q
JOIN public.clients c ON c.id = q.client_id
WHERE c.auth_user_id IS NOT NULL
LIMIT 5;

-- Facturas del cliente portal
SELECT 
  'invoices' as table_name,
  i.id,
  i.invoice_number,
  i.client_id,
  c.name as client_name,
  c.email as client_email,
  c.auth_user_id,
  i.status
FROM public.invoices i
JOIN public.clients c ON c.id = i.client_id
WHERE c.auth_user_id IS NOT NULL
LIMIT 5;

-- ============================================================================
-- 5. VERIFICAR AISLAMIENTO DE DATOS (Importante!)
-- ============================================================================

-- Contar tickets por cliente con auth_user_id
SELECT 
  c.id as client_id,
  c.name as client_name,
  c.email,
  c.auth_user_id,
  COUNT(t.id) as total_tickets
FROM public.clients c
LEFT JOIN public.tickets t ON t.client_id = c.id
WHERE c.auth_user_id IS NOT NULL
GROUP BY c.id, c.name, c.email, c.auth_user_id
ORDER BY total_tickets DESC;

-- Contar presupuestos por cliente con auth_user_id
SELECT 
  c.id as client_id,
  c.name as client_name,
  c.email,
  c.auth_user_id,
  COUNT(q.id) as total_quotes,
  COUNT(CASE WHEN q.recurrence_type IS NOT NULL THEN 1 END) as recurring_quotes
FROM public.clients c
LEFT JOIN public.quotes q ON q.client_id = c.id
WHERE c.auth_user_id IS NOT NULL
GROUP BY c.id, c.name, c.email, c.auth_user_id
ORDER BY total_quotes DESC;

-- Contar facturas por cliente con auth_user_id
SELECT 
  c.id as client_id,
  c.name as client_name,
  c.email,
  c.auth_user_id,
  COUNT(i.id) as total_invoices
FROM public.clients c
LEFT JOIN public.invoices i ON i.client_id = c.id
WHERE c.auth_user_id IS NOT NULL
GROUP BY c.id, c.name, c.email, c.auth_user_id
ORDER BY total_invoices DESC;

-- ============================================================================
-- 6. VERIFICAR POLÍTICAS PARA CADA TABLA
-- ============================================================================

-- Políticas de tickets
SELECT 
  'tickets' as table_name,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tickets'
ORDER BY cmd, policyname;

-- Políticas de quotes
SELECT 
  'quotes' as table_name,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'quotes'
ORDER BY cmd, policyname;

-- Políticas de invoices
SELECT 
  'invoices' as table_name,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'invoices'
ORDER BY cmd, policyname;

-- ============================================================================
-- 7. TEST SIMULADO (Para ejecutar como cliente autenticado)
-- ============================================================================

-- 🔒 NOTA: Para testear las políticas RLS correctamente, debes:
-- 1. Autenticarte como un cliente (con rol 'authenticated')
-- 2. Ejecutar queries desde la aplicación o usando service_role bypass
-- 
-- Las siguientes queries deberían funcionar SOLO si:
-- - auth.uid() = clients.auth_user_id
-- - El cliente está activo (is_active = true)

/*
-- Ejemplo de query que un cliente ejecutaría (comentado para seguridad):

-- Ver mis tickets
SELECT * FROM tickets 
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = auth.uid()
);

-- Ver mis presupuestos
SELECT * FROM quotes 
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = auth.uid()
);

-- Ver mis facturas
SELECT * FROM invoices 
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = auth.uid()
);

-- Ver mis servicios contratados (recurring quotes)
SELECT * FROM quotes 
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = auth.uid()
)
AND recurrence_type IS NOT NULL
AND status IN ('accepted', 'active', 'paused');
*/

-- ============================================================================
-- 8. VERIFICAR POSIBLES PROBLEMAS DE SEGURIDAD
-- ============================================================================

-- Clientes sin auth_user_id (no pueden acceder al portal)
SELECT 
  'WARNING: Clients without auth_user_id' as issue,
  id,
  name,
  email,
  company_id
FROM public.clients
WHERE auth_user_id IS NULL
  AND is_active = true
LIMIT 10;

-- Verificar si existen tickets/quotes/invoices sin client_id
SELECT 
  'WARNING: Tickets without client_id' as issue,
  COUNT(*) as count
FROM public.tickets
WHERE client_id IS NULL;

SELECT 
  'WARNING: Quotes without client_id' as issue,
  COUNT(*) as count
FROM public.quotes
WHERE client_id IS NULL;

SELECT 
  'WARNING: Invoices without client_id' as issue,
  COUNT(*) as count
FROM public.invoices
WHERE client_id IS NULL;

-- ============================================================================
-- 9. RESUMEN DE SEGURIDAD
-- ============================================================================

SELECT 
  '✅ SECURITY CHECKLIST' as category,
  'RLS Enabled' as check_name,
  CASE 
    WHEN COUNT(*) = (
      SELECT COUNT(*) 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('tickets', 'quotes', 'invoices', 'clients')
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tickets', 'quotes', 'invoices', 'clients')
  AND rowsecurity = true;

SELECT 
  '✅ SECURITY CHECKLIST' as category,
  'Client Policies Exist' as check_name,
  CASE 
    WHEN COUNT(*) >= 6 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%clients_can%';

SELECT 
  '✅ SECURITY CHECKLIST' as category,
  'Portal Clients Exist' as check_name,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS'
    ELSE '⚠️ WARNING - No portal clients found'
  END as status
FROM public.clients
WHERE auth_user_id IS NOT NULL;

-- ============================================================================
-- 📝 INTERPRETACIÓN DE RESULTADOS
-- ============================================================================
-- 
-- ✅ PASS: Todo funciona correctamente
-- ⚠️ WARNING: Advertencia - revisa los detalles pero no es crítico
-- ❌ FAIL: Error crítico - debe ser corregido
-- 
-- SIGUIENTES PASOS:
-- 1. Si RLS está deshabilitado, ejecutar: rls-client-portal-policies.sql
-- 2. Si faltan políticas, verificar que el script se ejecutó correctamente
-- 3. Si no hay clientes portal, crear uno de prueba en la aplicación
-- 4. Testear desde la UI del portal para verificar aislamiento de datos
-- ============================================================================
