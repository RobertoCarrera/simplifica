-- =====================================================
-- MIGRATION: Relación ticket_products
-- Fecha: 2025-10-18
-- Descripción: Crea la tabla para asociar productos a tickets,
--              similar a ticket_services, con RLS y políticas básicas.
-- =====================================================

-- 1) Crear tabla ticket_products si no existe
CREATE TABLE IF NOT EXISTS ticket_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Índices útiles
CREATE INDEX IF NOT EXISTS idx_ticket_products_ticket ON ticket_products(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_products_product ON ticket_products(product_id);
CREATE INDEX IF NOT EXISTS idx_ticket_products_company ON ticket_products(company_id);

-- 3) Trigger simple para mantener updated_at
CREATE OR REPLACE FUNCTION set_updated_at_ticket_products()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_ticket_products ON ticket_products;
CREATE TRIGGER trg_set_updated_at_ticket_products
BEFORE UPDATE ON ticket_products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_ticket_products();

-- 4) Habilitar RLS
ALTER TABLE ticket_products ENABLE ROW LEVEL SECURITY;

-- 5) Políticas básicas (equivalentes a ticket_services)
DROP POLICY IF EXISTS "Allow select ticket_products by company membership" ON ticket_products;
CREATE POLICY "Allow select ticket_products by company membership" ON ticket_products
  FOR SELECT
  USING (
    -- Si existe company_id en la fila, debe coincidir con la empresa del usuario
    (
      company_id IS NULL OR company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Allow insert ticket_products by company membership" ON ticket_products;
CREATE POLICY "Allow insert ticket_products by company membership" ON ticket_products
  FOR INSERT
  WITH CHECK (
    (
      company_id IS NULL OR company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Allow update ticket_products by company membership" ON ticket_products;
CREATE POLICY "Allow update ticket_products by company membership" ON ticket_products
  FOR UPDATE
  USING (
    (
      company_id IS NULL OR company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    (
      company_id IS NULL OR company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Allow delete ticket_products by company membership" ON ticket_products;
CREATE POLICY "Allow delete ticket_products by company membership" ON ticket_products
  FOR DELETE
  USING (
    (
      company_id IS NULL OR company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- 6) Grants mínimos para clientes autenticados
GRANT SELECT, INSERT, UPDATE, DELETE ON ticket_products TO authenticated;

-- 7) Comentarios
COMMENT ON TABLE ticket_products IS 'Relación de productos asociados a tickets con cantidades y precios.';
COMMENT ON COLUMN ticket_products.price_per_unit IS 'Precio por unidad al momento de agregar el producto al ticket.';
COMMENT ON COLUMN ticket_products.total_price IS 'Cantidad * precio por unidad.';
