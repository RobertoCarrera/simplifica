-- ============================================================================
-- RLS POLICIES PARA CLIENT PORTAL
-- ============================================================================
-- Políticas adicionales para permitir que clientes (role='client') accedan
-- solo a sus propios datos a través del portal de clientes.
-- ============================================================================

-- ============================================================================
-- 0. POLÍTICAS PARA USERS (Para clientes con rol client)
-- ============================================================================

-- Eliminar política si existe
DROP POLICY IF EXISTS "users_select_client_self" ON public.users;

-- Permitir a usuarios con rol 'client' ver su propio registro en users
CREATE POLICY "users_select_client_self"
ON public.users
FOR SELECT
TO authenticated
USING (
  -- El usuario puede ver su propio registro si tiene rol 'client'
  auth.uid() = auth_user_id
  AND role = 'client'
  AND active = true
);

COMMENT ON POLICY "users_select_client_self" ON public.users IS 
'Permite a clientes del portal ver su propio registro en la tabla users';

-- ============================================================================
-- 1. POLÍTICAS PARA TICKETS
-- ============================================================================

-- Eliminar política si existe
DROP POLICY IF EXISTS "clients_can_view_own_tickets" ON public.tickets;

-- Permitir a clientes ver sus propios tickets
CREATE POLICY "clients_can_view_own_tickets"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  -- Usuario es cliente y el ticket está asignado a ese cliente
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = tickets.client_id
    AND c.auth_user_id = auth.uid()
    AND c.is_active = true
  )
);

-- ============================================================================
-- 2. POLÍTICAS PARA QUOTES (PRESUPUESTOS)
-- ============================================================================

-- Eliminar políticas si existen
DROP POLICY IF EXISTS "clients_can_view_own_quotes" ON public.quotes;
DROP POLICY IF EXISTS "clients_can_update_own_quotes_status" ON public.quotes;

-- Permitir a clientes ver sus propios presupuestos
CREATE POLICY "clients_can_view_own_quotes"
ON public.quotes
FOR SELECT
TO authenticated
USING (
  -- Usuario es cliente y el presupuesto está asignado a ese cliente
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quotes.client_id
    AND c.auth_user_id = auth.uid()
    AND c.is_active = true
  )
);

-- Permitir a clientes responder a sus presupuestos (accept/reject)
CREATE POLICY "clients_can_update_own_quotes_status"
ON public.quotes
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quotes.client_id
    AND c.auth_user_id = auth.uid()
    AND c.is_active = true
  )
)
WITH CHECK (
  -- Solo pueden modificar el campo status (validación adicional en Edge Function)
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quotes.client_id
    AND c.auth_user_id = auth.uid()
    AND c.is_active = true
  )
);

-- ============================================================================
-- 3. POLÍTICAS PARA QUOTE_ITEMS
-- ============================================================================

-- Eliminar política si existe
DROP POLICY IF EXISTS "clients_can_view_own_quote_items" ON public.quote_items;

-- Permitir a clientes ver items de sus presupuestos
CREATE POLICY "clients_can_view_own_quote_items"
ON public.quote_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.clients c ON c.id = q.client_id
    WHERE q.id = quote_items.quote_id
    AND c.auth_user_id = auth.uid()
    AND c.is_active = true
  )
);

-- ============================================================================
-- 4. POLÍTICAS PARA INVOICES (FACTURAS)
-- ============================================================================

-- Eliminar política si existe
DROP POLICY IF EXISTS "clients_can_view_own_invoices" ON public.invoices;

-- Permitir a clientes ver sus propias facturas
CREATE POLICY "clients_can_view_own_invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  -- Usuario es cliente y la factura está asignada a ese cliente
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = invoices.client_id
    AND c.auth_user_id = auth.uid()
    AND c.is_active = true
  )
);

-- ============================================================================
-- 5. POLÍTICAS PARA INVOICE_ITEMS
-- ============================================================================

-- Eliminar política si existe
DROP POLICY IF EXISTS "clients_can_view_own_invoice_items" ON public.invoice_items;

-- Permitir a clientes ver items de sus facturas
CREATE POLICY "clients_can_view_own_invoice_items"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.clients c ON c.id = i.client_id
    WHERE i.id = invoice_items.invoice_id
    AND c.auth_user_id = auth.uid()
    AND c.is_active = true
  )
);

-- ============================================================================
-- 6. POLÍTICAS PARA TICKET_STAGES
-- ============================================================================

-- Eliminar política si existe
DROP POLICY IF EXISTS "clients_can_view_ticket_stages" ON public.ticket_stages;

-- Permitir a clientes ver etapas de tickets (solo lectura)
CREATE POLICY "clients_can_view_ticket_stages"
ON public.ticket_stages
FOR SELECT
TO authenticated
USING (
  -- Si el cliente tiene tickets, puede ver las etapas de su empresa
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.auth_user_id = auth.uid()
    AND c.company_id = ticket_stages.company_id
    AND c.is_active = true
  )
);

-- ============================================================================
-- 7. POLÍTICAS PARA TICKET_COMMENTS (SI EXISTE)
-- ============================================================================

-- Permitir a clientes ver comentarios de sus tickets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ticket_comments') THEN
    -- Eliminar política si existe
    EXECUTE 'DROP POLICY IF EXISTS "clients_can_view_own_ticket_comments" ON public.ticket_comments';
    
    -- Crear política
    EXECUTE '
      CREATE POLICY "clients_can_view_own_ticket_comments"
      ON public.ticket_comments
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.tickets t
          JOIN public.clients c ON c.id = t.client_id
          WHERE t.id = ticket_comments.ticket_id
          AND c.auth_user_id = auth.uid()
          AND c.is_active = true
        )
      )
    ';
  END IF;
END $$;

-- ============================================================================
-- VERIFICACIÓN: Listar políticas creadas para clientes
-- ============================================================================

SELECT 
  tablename,
  policyname,
  cmd,
  CASE 
    WHEN policyname LIKE '%clients_can%' THEN '✅ Client Policy'
    ELSE 'Other Policy'
  END as policy_type
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%clients_can%'
ORDER BY tablename, policyname;

-- ============================================================================
-- TESTING (Opcional - comentar en producción)
-- ============================================================================

-- Para testear, necesitas:
-- 1. Un usuario autenticado con rol 'client'
-- 2. Un registro en la tabla clients con auth_user_id = auth.uid()
-- 3. Ejecutar queries como ese usuario

-- Ejemplo de query que debería funcionar para un cliente:
-- SELECT * FROM tickets WHERE client_id = (SELECT id FROM clients WHERE auth_user_id = auth.uid());

COMMENT ON POLICY "clients_can_view_own_tickets" ON public.tickets IS 
'Permite a clientes del portal ver solo sus propios tickets';

COMMENT ON POLICY "clients_can_view_own_quotes" ON public.quotes IS 
'Permite a clientes del portal ver solo sus propios presupuestos';

COMMENT ON POLICY "clients_can_update_own_quotes_status" ON public.quotes IS 
'Permite a clientes del portal aceptar/rechazar sus presupuestos';

COMMENT ON POLICY "clients_can_view_own_invoices" ON public.invoices IS 
'Permite a clientes del portal ver solo sus propias facturas';

-- ============================================================================
-- 📝 IMPORTANTE: Después de ejecutar este script
-- ============================================================================
-- 1. Los clientes (con auth_user_id en tabla clients) podrán acceder a sus datos
-- 2. Las políticas existentes para staff (users table) siguen funcionando
-- 3. Cada tabla ahora tiene políticas separadas para staff y clients
-- 4. RLS está habilitado y protege los datos correctamente
-- ============================================================================
