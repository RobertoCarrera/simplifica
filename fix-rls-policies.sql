-- =====================================================
-- POLÍTICAS RLS CORREGIDAS - service_variants
-- =====================================================
-- Lógica:
-- 1. Usuarios de la compañía pueden ver/gestionar variantes de sus servicios
-- 2. Clientes ven solo variantes asignadas a ellos
-- 3. Si el cliente NO tiene variantes asignadas para un servicio, ve las públicas

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "Admins can manage all variants" ON service_variants;
DROP POLICY IF EXISTS "Clients can view variants of contracted services" ON service_variants;
DROP POLICY IF EXISTS "Clients can view visible variants of public services" ON service_variants;
DROP POLICY IF EXISTS "Clients see assigned variants or public if none assigned" ON service_variants;
DROP POLICY IF EXISTS "Users can delete service variants from their company" ON service_variants;
DROP POLICY IF EXISTS "Users can insert service variants in their company" ON service_variants;
DROP POLICY IF EXISTS "Users can update service variants from their company" ON service_variants;
DROP POLICY IF EXISTS "Users can view service variants from their company" ON service_variants;

-- Política 1: Usuarios de la compañía pueden ver variantes de sus servicios
CREATE POLICY "Company users can view their variants" ON service_variants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM services s
    JOIN users u ON u.company_id = s.company_id
    WHERE s.id = service_variants.service_id 
    AND u.auth_user_id = auth.uid()
  )
);

-- Política 2: Usuarios de la compañía pueden gestionar variantes de sus servicios
CREATE POLICY "Company users can manage their variants" ON service_variants
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM services s
    JOIN users u ON u.company_id = s.company_id
    WHERE s.id = service_variants.service_id 
    AND u.auth_user_id = auth.uid()
  )
);

-- Política 3: Clientes ven variantes asignadas o públicas (si no tienen asignaciones)
CREATE POLICY "Clients see assigned or public variants" ON service_variants
FOR SELECT
USING (
  -- Cliente tiene esta variante específica asignada
  EXISTS (
    SELECT 1 FROM client_variant_assignments cva
    JOIN clients c ON c.id = cva.client_id
    WHERE cva.variant_id = service_variants.id
    AND c.auth_user_id = auth.uid()
  )
  OR
  -- Cliente NO tiene ninguna variante asignada para este servicio Y la variante es pública
  (
    is_hidden = false
    AND NOT EXISTS (
      SELECT 1 FROM client_variant_assignments cva
      JOIN clients c ON c.id = cva.client_id
      WHERE cva.service_id = service_variants.service_id
      AND c.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM services s
      WHERE s.id = service_variants.service_id
      AND s.is_public = true
      AND s.is_active = true
    )
  )
);

-- =====================================================
-- POLÍTICAS RLS - client_variant_assignments
-- =====================================================

-- Enable RLS on client_variant_assignments
ALTER TABLE client_variant_assignments ENABLE ROW LEVEL SECURITY;

-- Policy for client_variant_assignments
-- Admins can do everything
DROP POLICY IF EXISTS "Admins can manage assignments" ON client_variant_assignments;
CREATE POLICY "Admins can manage assignments" ON client_variant_assignments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- Clients can view their own assignments
DROP POLICY IF EXISTS "Clients can view their own assignments" ON client_variant_assignments;
CREATE POLICY "Clients can view their own assignments" ON client_variant_assignments
FOR SELECT
USING (
  client_id IN (
    SELECT id FROM clients WHERE email = (auth.jwt() ->> 'email')
  )
);
