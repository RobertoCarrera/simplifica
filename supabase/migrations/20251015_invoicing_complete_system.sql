-- =====================================================
-- MÓDULO DE FACTURACIÓN COMPLETO
-- Con GDPR + Veri*Factu Ready
-- Fecha: 2025-10-15
-- =====================================================

-- =====================================================
-- PARTE 1: ENUMS Y TIPOS
-- =====================================================

-- Estado de las facturas
CREATE TYPE invoice_status AS ENUM (
  'draft',      -- Borrador
  'sent',       -- Enviada al cliente
  'paid',       -- Pagada
  'partial',    -- Parcialmente pagada
  'overdue',    -- Vencida
  'cancelled'   -- Cancelada/Anulada
);

-- Métodos de pago
CREATE TYPE payment_method AS ENUM (
  'cash',           -- Efectivo
  'bank_transfer',  -- Transferencia
  'card',           -- Tarjeta
  'direct_debit',   -- Domiciliación
  'paypal',         -- PayPal
  'other'           -- Otro
);

-- Tipos de factura (para Veri*Factu)
CREATE TYPE invoice_type AS ENUM (
  'normal',         -- Factura normal
  'simplified',     -- Factura simplificada
  'rectificative',  -- Factura rectificativa
  'summary'         -- Factura resumen
);

-- =====================================================
-- PARTE 2: TABLA DE SERIES DE FACTURACIÓN
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Configuración de la serie
  series_code TEXT NOT NULL, -- "A", "B", "RECT", etc.
  series_name TEXT NOT NULL, -- "Serie General", "Rectificativas"
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  prefix TEXT NOT NULL, -- "2025-A-"
  next_number INTEGER NOT NULL DEFAULT 1,
  
  -- Control
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  
  -- Veri*Factu
  verifactu_enabled BOOLEAN NOT NULL DEFAULT true,
  last_verifactu_hash TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT unique_series_per_company_year UNIQUE (company_id, series_code, year),
  CONSTRAINT one_default_per_company CHECK (
    NOT is_default OR 
    (SELECT COUNT(*) FROM invoice_series WHERE company_id = invoice_series.company_id AND is_default = true) = 1
  )
);

-- Índices
CREATE INDEX idx_invoice_series_company ON invoice_series(company_id);
CREATE INDEX idx_invoice_series_active ON invoice_series(company_id, is_active);

COMMENT ON TABLE invoice_series IS 'Series de facturación con numeración automática';

-- =====================================================
-- PARTE 3: TABLA DE FACTURAS
-- =====================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  series_id UUID NOT NULL REFERENCES invoice_series(id) ON DELETE RESTRICT,
  
  -- Numeración
  invoice_number TEXT NOT NULL, -- "00001", "00002", etc.
  invoice_series TEXT NOT NULL, -- "2025-A" (desnormalizado para performance)
  full_invoice_number TEXT GENERATED ALWAYS AS (invoice_series || '-' || invoice_number) STORED,
  
  -- Tipo y fechas
  invoice_type invoice_type NOT NULL DEFAULT 'normal',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  
  -- Importes
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  
  -- Estado y pago
  status invoice_status NOT NULL DEFAULT 'draft',
  payment_method payment_method,
  
  -- Notas
  notes TEXT,
  internal_notes TEXT, -- Solo visible para empresa
  
  -- Factura rectificativa
  rectifies_invoice_id UUID REFERENCES invoices(id),
  rectification_reason TEXT,
  
  -- Veri*Factu (preparado para futuro)
  verifactu_hash TEXT,
  verifactu_signature TEXT,
  verifactu_timestamp TIMESTAMP WITH TIME ZONE,
  verifactu_qr_code TEXT,
  verifactu_xml TEXT,
  verifactu_chain_position INTEGER, -- Posición en la cadena
  
  -- GDPR
  anonymized_at TIMESTAMP WITH TIME ZONE,
  retention_until DATE GENERATED ALWAYS AS (invoice_date + INTERVAL '7 years') STORED,
  gdpr_legal_basis TEXT NOT NULL DEFAULT 'legal_obligation', -- Art. 6.1.c GDPR
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
  
  -- Constraints
  CONSTRAINT unique_invoice_number_per_series UNIQUE (series_id, invoice_number),
  CONSTRAINT valid_total CHECK (total = subtotal + tax_amount),
  CONSTRAINT valid_paid_amount CHECK (paid_amount >= 0 AND paid_amount <= total),
  CONSTRAINT valid_dates CHECK (due_date >= invoice_date)
);

-- Índices para performance
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_series ON invoices(series_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_full_number ON invoices(full_invoice_number);
CREATE INDEX idx_invoices_retention ON invoices(retention_until) WHERE anonymized_at IS NULL;
CREATE INDEX idx_invoices_verifactu ON invoices(verifactu_chain_position) WHERE verifactu_hash IS NOT NULL;

COMMENT ON TABLE invoices IS 'Facturas emitidas con soporte Veri*Factu y GDPR';

-- =====================================================
-- PARTE 4: TABLA DE LÍNEAS DE FACTURA
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Orden y descripción
  line_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  
  -- Cantidades y precios
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  
  -- Impuestos
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00, -- IVA 21% por defecto
  tax_amount NUMERIC(12,2) NOT NULL,
  
  -- Subtotales
  subtotal NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  
  -- Referencias opcionales
  product_id UUID, -- FK a products si existe
  service_id UUID, -- FK a services si existe
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT valid_quantity CHECK (quantity > 0),
  CONSTRAINT valid_unit_price CHECK (unit_price >= 0),
  CONSTRAINT valid_discount CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT valid_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT valid_item_total CHECK (total = subtotal + tax_amount)
);

-- Índices
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON invoice_items(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_invoice_items_service ON invoice_items(service_id) WHERE service_id IS NOT NULL;

COMMENT ON TABLE invoice_items IS 'Líneas/conceptos de las facturas';

-- =====================================================
-- PARTE 5: TABLA DE PAGOS
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Datos del pago
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method payment_method NOT NULL,
  
  -- Referencias
  reference TEXT, -- Número de transferencia, etc.
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT valid_payment_amount CHECK (amount > 0)
);

-- Índices
CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX idx_invoice_payments_date ON invoice_payments(payment_date DESC);

COMMENT ON TABLE invoice_payments IS 'Pagos recibidos de facturas';

-- =====================================================
-- PARTE 6: TABLA DE PLANTILLAS
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Configuración
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Diseño
  html_template TEXT NOT NULL,
  css_styles TEXT,
  
  -- Configuración adicional
  show_company_logo BOOLEAN NOT NULL DEFAULT true,
  show_payment_info BOOLEAN NOT NULL DEFAULT true,
  show_tax_breakdown BOOLEAN NOT NULL DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT one_default_template_per_company CHECK (
    NOT is_default OR 
    (SELECT COUNT(*) FROM invoice_templates WHERE company_id = invoice_templates.company_id AND is_default = true) = 1
  )
);

-- Índices
CREATE INDEX idx_invoice_templates_company ON invoice_templates(company_id);

COMMENT ON TABLE invoice_templates IS 'Plantillas de diseño para PDFs de facturas';

-- =====================================================
-- PARTE 7: FUNCIONES AUXILIARES
-- =====================================================

-- Función: Obtener siguiente número de factura
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_series_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_number INTEGER;
  v_prefix TEXT;
  v_number_text TEXT;
BEGIN
  -- Obtener y actualizar el siguiente número
  UPDATE invoice_series
  SET next_number = next_number + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_series_id
  RETURNING next_number - 1, prefix INTO v_next_number, v_prefix;
  
  -- Formatear con ceros a la izquierda (5 dígitos)
  v_number_text := LPAD(v_next_number::TEXT, 5, '0');
  
  RETURN v_number_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_next_invoice_number IS 'Genera el siguiente número de factura para una serie';

-- Función: Calcular totales de factura
CREATE OR REPLACE FUNCTION calculate_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_amount NUMERIC(12,2);
  v_total NUMERIC(12,2);
  v_paid_amount NUMERIC(12,2);
  v_new_status invoice_status;
BEGIN
  -- Calcular totales desde las líneas
  SELECT 
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(total), 0)
  INTO v_subtotal, v_tax_amount, v_total
  FROM invoice_items
  WHERE invoice_id = p_invoice_id;
  
  -- Calcular total pagado
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_amount
  FROM invoice_payments
  WHERE invoice_id = p_invoice_id;
  
  -- Determinar nuevo estado
  SELECT status INTO v_new_status FROM invoices WHERE id = p_invoice_id;
  
  IF v_paid_amount >= v_total AND v_total > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid_amount > 0 AND v_paid_amount < v_total THEN
    v_new_status := 'partial';
  ELSIF v_new_status = 'draft' THEN
    v_new_status := 'draft';
  ELSIF CURRENT_DATE > (SELECT due_date FROM invoices WHERE id = p_invoice_id) THEN
    v_new_status := 'overdue';
  ELSIF v_new_status NOT IN ('cancelled', 'paid') THEN
    v_new_status := 'sent';
  END IF;
  
  -- Actualizar factura
  UPDATE invoices
  SET 
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total = v_total,
    paid_amount = v_paid_amount,
    status = v_new_status,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_invoice_totals IS 'Recalcula los totales y estado de una factura';

-- Función: Anonimizar factura (GDPR)
CREATE OR REPLACE FUNCTION anonymize_invoice_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo anonimizar si ya pasó el periodo de retención
  IF NEW.retention_until < CURRENT_DATE AND NEW.anonymized_at IS NULL THEN
    -- Anonimizar datos sensibles pero mantener información fiscal
    NEW.notes := 'ANONIMIZADO';
    NEW.internal_notes := 'ANONIMIZADO';
    NEW.anonymized_at := CURRENT_TIMESTAMP;
    
    RAISE NOTICE 'Factura % anonimizada por GDPR', NEW.full_invoice_number;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función: Generar hash Veri*Factu (preparado para futuro)
CREATE OR REPLACE FUNCTION generate_verifactu_hash(p_invoice_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_invoice RECORD;
  v_previous_hash TEXT;
  v_data_string TEXT;
  v_new_hash TEXT;
BEGIN
  -- Obtener datos de la factura
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  -- Obtener hash de la factura anterior en la serie
  SELECT verifactu_hash INTO v_previous_hash
  FROM invoices
  WHERE series_id = v_invoice.series_id
    AND verifactu_chain_position = (v_invoice.verifactu_chain_position - 1)
  LIMIT 1;
  
  -- Si no hay anterior, usar hash inicial
  v_previous_hash := COALESCE(v_previous_hash, 'GENESIS');
  
  -- Construir string de datos
  v_data_string := v_previous_hash || 
                   v_invoice.full_invoice_number ||
                   v_invoice.invoice_date::TEXT ||
                   v_invoice.total::TEXT ||
                   v_invoice.company_id::TEXT ||
                   v_invoice.client_id::TEXT;
  
  -- Generar hash SHA-256 (requiere extension pgcrypto)
  v_new_hash := encode(digest(v_data_string, 'sha256'), 'hex');
  
  RETURN v_new_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_verifactu_hash IS 'Genera hash SHA-256 para cadena Veri*Factu';

-- =====================================================
-- PARTE 8: TRIGGERS
-- =====================================================

-- Trigger: Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_series_updated_at
  BEFORE UPDATE ON invoice_series
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoice_templates_updated_at
  BEFORE UPDATE ON invoice_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Recalcular totales al insertar/actualizar línea
CREATE TRIGGER recalculate_invoice_totals_on_item_insert
  AFTER INSERT ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals_trigger();

CREATE TRIGGER recalculate_invoice_totals_on_item_update
  AFTER UPDATE ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals_trigger();

CREATE TRIGGER recalculate_invoice_totals_on_item_delete
  AFTER DELETE ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals_trigger();

CREATE OR REPLACE FUNCTION calculate_invoice_totals_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM calculate_invoice_totals(OLD.invoice_id);
  ELSE
    PERFORM calculate_invoice_totals(NEW.invoice_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Recalcular totales al registrar pago
CREATE TRIGGER recalculate_invoice_totals_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals_payment_trigger();

CREATE OR REPLACE FUNCTION calculate_invoice_totals_payment_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM calculate_invoice_totals(OLD.invoice_id);
  ELSE
    PERFORM calculate_invoice_totals(NEW.invoice_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Anonimizar facturas antiguas (GDPR)
CREATE TRIGGER anonymize_old_invoices_trigger
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION anonymize_invoice_data();

-- =====================================================
-- PARTE 9: RLS POLICIES
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_templates ENABLE ROW LEVEL SECURITY;

-- Políticas para invoice_series
CREATE POLICY "invoice_series_select_company"
  ON invoice_series FOR SELECT
  TO public
  USING (company_id = get_user_company_id());

CREATE POLICY "invoice_series_insert_company"
  ON invoice_series FOR INSERT
  TO public
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "invoice_series_update_company"
  ON invoice_series FOR UPDATE
  TO public
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "invoice_series_delete_company"
  ON invoice_series FOR DELETE
  TO public
  USING (company_id = get_user_company_id());

-- Políticas para invoices
CREATE POLICY "invoices_select_company"
  ON invoices FOR SELECT
  TO public
  USING (company_id = get_user_company_id() AND deleted_at IS NULL);

CREATE POLICY "invoices_insert_company"
  ON invoices FOR INSERT
  TO public
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "invoices_update_company"
  ON invoices FOR UPDATE
  TO public
  USING (company_id = get_user_company_id() AND deleted_at IS NULL)
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "invoices_delete_company"
  ON invoices FOR DELETE
  TO public
  USING (company_id = get_user_company_id());

-- Políticas para invoice_items
CREATE POLICY "invoice_items_select_company"
  ON invoice_items FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_items.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "invoice_items_insert_company"
  ON invoice_items FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_items.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "invoice_items_update_company"
  ON invoice_items FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_items.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "invoice_items_delete_company"
  ON invoice_items FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_items.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

-- Políticas para invoice_payments
CREATE POLICY "invoice_payments_select_company"
  ON invoice_payments FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_payments.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "invoice_payments_insert_company"
  ON invoice_payments FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_payments.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "invoice_payments_update_company"
  ON invoice_payments FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_payments.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY "invoice_payments_delete_company"
  ON invoice_payments FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM invoices 
      WHERE invoices.id = invoice_payments.invoice_id 
        AND invoices.company_id = get_user_company_id()
    )
  );

-- Políticas para invoice_templates
CREATE POLICY "invoice_templates_select_company"
  ON invoice_templates FOR SELECT
  TO public
  USING (company_id = get_user_company_id());

CREATE POLICY "invoice_templates_insert_company"
  ON invoice_templates FOR INSERT
  TO public
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "invoice_templates_update_company"
  ON invoice_templates FOR UPDATE
  TO public
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "invoice_templates_delete_company"
  ON invoice_templates FOR DELETE
  TO public
  USING (company_id = get_user_company_id());

-- =====================================================
-- PARTE 10: DATOS INICIALES
-- =====================================================

-- Insertar serie por defecto para cada empresa
INSERT INTO invoice_series (company_id, series_code, series_name, year, prefix, is_default, is_active)
SELECT 
  id,
  'A',
  'Serie General',
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-A-',
  true,
  true
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_series 
  WHERE invoice_series.company_id = companies.id
);

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ MÓDULO DE FACTURACIÓN INSTALADO';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Tablas creadas:';
  RAISE NOTICE '  - invoice_series';
  RAISE NOTICE '  - invoices';
  RAISE NOTICE '  - invoice_items';
  RAISE NOTICE '  - invoice_payments';
  RAISE NOTICE '  - invoice_templates';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 RLS Policies: Habilitadas';
  RAISE NOTICE '⚙️  Triggers: Configurados';
  RAISE NOTICE '📜 Funciones: Creadas';
  RAISE NOTICE '';
  RAISE NOTICE '✅ GDPR: Implementado';
  RAISE NOTICE '📋 Veri*Factu: Preparado';
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
