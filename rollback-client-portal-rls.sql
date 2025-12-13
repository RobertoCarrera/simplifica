-- ============================================================================
-- ROLLBACK CLIENT PORTAL RLS POLICIES
-- ============================================================================
-- Script para revertir las políticas RLS del portal de clientes.
-- USAR SOLO EN CASO DE EMERGENCIA.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ELIMINAR POLÍTICAS DE TICKETS
-- ============================================================================

DROP POLICY IF EXISTS "clients_can_view_own_tickets" ON public.tickets;

-- ============================================================================
-- 2. ELIMINAR POLÍTICAS DE QUOTES
-- ============================================================================

DROP POLICY IF EXISTS "clients_can_view_own_quotes" ON public.quotes;
DROP POLICY IF EXISTS "clients_can_update_own_quotes_status" ON public.quotes;

-- ============================================================================
-- 3. ELIMINAR POLÍTICAS DE QUOTE_ITEMS
-- ============================================================================

DROP POLICY IF EXISTS "clients_can_view_own_quote_items" ON public.quote_items;

-- ============================================================================
-- 4. ELIMINAR POLÍTICAS DE INVOICES
-- ============================================================================

DROP POLICY IF EXISTS "clients_can_view_own_invoices" ON public.invoices;

-- ============================================================================
-- 5. ELIMINAR POLÍTICAS DE INVOICE_ITEMS
-- ============================================================================

DROP POLICY IF EXISTS "clients_can_view_own_invoice_items" ON public.invoice_items;

-- ============================================================================
-- 6. ELIMINAR POLÍTICAS DE TICKET_STAGES
-- ============================================================================

DROP POLICY IF EXISTS "clients_can_view_ticket_stages" ON public.ticket_stages;

-- ============================================================================
-- 7. ELIMINAR POLÍTICAS DE TICKET_COMMENTS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ticket_comments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "clients_can_view_own_ticket_comments" ON public.ticket_comments';
  END IF;
END $$;

-- ============================================================================
-- VERIFICAR ELIMINACIÓN
-- ============================================================================

SELECT 
  'Remaining Client Policies:' as status,
  COUNT(*) as count
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%clients_can%';

-- ============================================================================
-- CONFIRMAR O REVERTIR
-- ============================================================================

-- Si todo está correcto, ejecutar:
COMMIT;

-- Si algo salió mal, ejecutar:
-- ROLLBACK;

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
-- 
-- 1. Este rollback NO elimina las políticas para staff (users table)
-- 2. Solo elimina políticas específicas para clientes del portal
-- 3. RLS sigue habilitado en las tablas
-- 4. Clientes no podrán acceder a sus datos después del rollback
-- 5. Las Edge Functions seguirán funcionando para staff
-- 
-- DESPUÉS DEL ROLLBACK:
-- - Portal de clientes NO funcionará correctamente
-- - Necesitarás volver a aplicar rls-client-portal-policies.sql
-- - Verifica que no haya otros problemas antes de revertir
-- 
-- ============================================================================
