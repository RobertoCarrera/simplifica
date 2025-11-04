-- =====================================================
-- SISTEMA DE PRESUPUESTOS (QUOTES)
-- =====================================================
-- Fecha: 2025-10-15
-- Descripción: Sistema completo de presupuestos con conversión a facturas
-- Integración: Compatible con Veri*Factu y GDPR
-- =====================================================

-- =====================================================
-- 1. ENUMS
-- =====================================================

CREATE TYPE quote_status AS ENUM (
  'draft',           -- Borrador (no enviado)
  'sent',            -- Enviado al cliente
  'viewed',          -- Visto por el cliente
  'accepted',        -- Aceptado por el cliente
  'rejected',        -- Rechazado por el cliente
  'expired',         -- Expirado (pasó fecha validez)
  'invoiced',        -- Convertido a factura
  'cancelled'        -- Cancelado
);

-- =====================================================
-- 2. TABLA PRINCIPAL: quotes
-- =====================================================

CREATE TABLE quotes (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  
  -- Numeración
  quote_number VARCHAR(50) NOT NULL,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  sequence_number INTEGER NOT NULL,
  full_quote_number VARCHAR(100) GENERATED ALWAYS AS (
    year || '-P-' || LPAD(sequence_number::TEXT, 5, '0')
  ) STORED,
  
  -- Estado y fechas
  status quote_status NOT NULL DEFAULT 'draft',
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL, -- Fecha de validez del presupuesto
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  invoiced_at TIMESTAMP WITH TIME ZONE,
  
  -- Referencia a factura generada
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  
  -- Información del presupuesto
  title VARCHAR(500) NOT NULL,
  description TEXT,
  notes TEXT,
  terms_conditions TEXT,
  
  -- Totales (calculados automáticamente)
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  
  -- Descuento global
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  
  -- Información adicional
  currency VARCHAR(3) DEFAULT 'EUR',
  language VARCHAR(5) DEFAULT 'es',
  
  -- Seguimiento cliente
  client_viewed_at TIMESTAMP WITH TIME ZONE,
  client_ip_address INET,
  client_user_agent TEXT,
  
  -- PDF generado
  pdf_url TEXT,
  pdf_generated_at TIMESTAMP WITH TIME ZONE,
  
  -- Firma digital (opcional, para seguridad adicional)
  digital_signature TEXT,
  signature_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Auditoría
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- GDPR
  is_anonymized BOOLEAN DEFAULT FALSE,
  anonymized_at TIMESTAMP WITH TIME ZONE,
  retention_until DATE GENERATED ALWAYS AS (
    quote_date + INTERVAL '7 years'
  ) STORED,
  
  -- Constraints
  CONSTRAINT valid_dates CHECK (valid_until >= quote_date),
  CONSTRAINT valid_discount CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT valid_totals CHECK (subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0)
);

-- Índices para optimización
CREATE INDEX idx_quotes_company ON quotes(company_id);
CREATE INDEX idx_quotes_client ON quotes(client_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_quote_date ON quotes(quote_date);
CREATE INDEX idx_quotes_valid_until ON quotes(valid_until);
CREATE INDEX idx_quotes_full_number ON quotes(full_quote_number);
CREATE INDEX idx_quotes_invoice ON quotes(invoice_id);
CREATE INDEX idx_quotes_retention ON quotes(retention_until) WHERE NOT is_anonymized;

-- Índice único para evitar duplicados por empresa
CREATE UNIQUE INDEX idx_quotes_unique_number ON quotes(company_id, year, sequence_number);

COMMENT ON TABLE quotes IS 'Presupuestos enviados a clientes con posibilidad de conversión a factura';
COMMENT ON COLUMN quotes.valid_until IS 'Fecha hasta la cual el presupuesto es válido';
COMMENT ON COLUMN quotes.invoice_id IS 'ID de la factura generada si el presupuesto fue aceptado';

-- =====================================================
-- 3. TABLA DE ITEMS: quote_items
-- =====================================================

CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Ordenamiento
  line_number INTEGER NOT NULL,
  
  -- Información del item
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL,
  
  -- Impuestos
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 21.00, -- IVA estándar España
  tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  
  -- Descuento por línea
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  
  -- Totales
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  
  -- Información adicional
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_quantity CHECK (quantity > 0),
  CONSTRAINT valid_price CHECK (unit_price >= 0),
  CONSTRAINT valid_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT valid_discount CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

-- Índices
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX idx_quote_items_company ON quote_items(company_id);
CREATE INDEX idx_quote_items_line_number ON quote_items(quote_id, line_number);

COMMENT ON TABLE quote_items IS 'Líneas de detalle de los presupuestos';

-- =====================================================
-- 4. TABLA DE PLANTILLAS: quote_templates
-- =====================================================

CREATE TABLE quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Información de la plantilla
  name VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Contenido predefinido
  title_template VARCHAR(500),
  description_template TEXT,
  notes_template TEXT,
  terms_conditions_template TEXT,
  
  -- Items predefinidos (JSON)
  default_items JSONB,
  
  -- Configuración
  default_valid_days INTEGER DEFAULT 30,
  default_tax_rate DECIMAL(5, 2) DEFAULT 21.00,
  
  -- Uso
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Auditoría
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_quote_templates_company ON quote_templates(company_id);
CREATE INDEX idx_quote_templates_active ON quote_templates(company_id, is_active);

COMMENT ON TABLE quote_templates IS 'Plantillas reutilizables para crear presupuestos rápidamente';

-- =====================================================
-- 5. FUNCIONES
-- =====================================================

-- Función: Obtener siguiente número de presupuesto
CREATE OR REPLACE FUNCTION get_next_quote_number(p_company_id UUID, p_year INTEGER)
RETURNS INTEGER AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Obtener el siguiente número de secuencia para el año
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO next_number
  FROM quotes
  WHERE company_id = p_company_id
    AND year = p_year;
  
  RETURN next_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_next_quote_number IS 'Genera el siguiente número de presupuesto para una empresa y año';

-- Función: Calcular totales de items
CREATE OR REPLACE FUNCTION calculate_quote_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular subtotal antes de descuento
  NEW.subtotal := NEW.quantity * NEW.unit_price;
  
  -- Calcular descuento
  NEW.discount_amount := NEW.subtotal * (NEW.discount_percent / 100);
  
  -- Calcular base imponible después de descuento
  NEW.subtotal := NEW.subtotal - NEW.discount_amount;
  
  -- Calcular impuesto
  NEW.tax_amount := NEW.subtotal * (NEW.tax_rate / 100);
  
  -- Calcular total
  NEW.total := NEW.subtotal + NEW.tax_amount;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular totales de items
CREATE TRIGGER trigger_calculate_quote_item_totals
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_item_totals();

-- Función: Calcular totales del presupuesto
CREATE OR REPLACE FUNCTION calculate_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
  items_subtotal DECIMAL(12, 2);
  items_tax DECIMAL(12, 2);
BEGIN
  -- Sumar todos los items
  SELECT 
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(tax_amount), 0)
  INTO items_subtotal, items_tax
  FROM quote_items
  WHERE quote_id = NEW.quote_id;
  
  -- Actualizar totales del presupuesto
  UPDATE quotes
  SET 
    subtotal = items_subtotal,
    tax_amount = items_tax,
    total_amount = items_subtotal + items_tax,
    updated_at = NOW()
  WHERE id = NEW.quote_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para recalcular totales cuando cambian los items
CREATE TRIGGER trigger_recalculate_quote_totals_insert
  AFTER INSERT ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_totals();

CREATE TRIGGER trigger_recalculate_quote_totals_update
  AFTER UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_totals();

CREATE TRIGGER trigger_recalculate_quote_totals_delete
  AFTER DELETE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_totals();

-- Función: Marcar presupuestos expirados
CREATE OR REPLACE FUNCTION mark_expired_quotes()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE quotes
  SET status = 'expired',
      updated_at = NOW()
  WHERE status IN ('draft', 'sent', 'viewed')
    AND valid_until < CURRENT_DATE
    AND NOT is_anonymized;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_expired_quotes IS 'Marca como expirados los presupuestos que superaron su fecha de validez';

-- Función: Convertir presupuesto a factura
CREATE OR REPLACE FUNCTION convert_quote_to_invoice(
  p_quote_id UUID,
  p_invoice_series_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_invoice_id UUID;
  v_item RECORD;
  v_company_id UUID;
  v_year INTEGER;
  v_sequence INTEGER;
BEGIN
  -- Obtener presupuesto
  SELECT * INTO v_quote
  FROM quotes
  WHERE id = p_quote_id;
  
  -- Validar estado
  IF v_quote.status != 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir presupuestos aceptados';
  END IF;
  
  IF v_quote.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este presupuesto ya fue convertido a factura';
  END IF;
  
  -- Obtener serie de factura (usar por defecto si no se especifica)
  IF p_invoice_series_id IS NULL THEN
    SELECT id INTO p_invoice_series_id
    FROM invoice_series
    WHERE company_id = v_quote.company_id
      AND is_default = TRUE
      AND is_active = TRUE
    LIMIT 1;
    
    IF p_invoice_series_id IS NULL THEN
      RAISE EXCEPTION 'No hay serie de factura por defecto configurada';
    END IF;
  END IF;
  
  -- Obtener siguiente número de factura
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  SELECT get_next_invoice_number(p_invoice_series_id, v_year) INTO v_sequence;
  
  -- Crear factura
  INSERT INTO invoices (
    company_id,
    client_id,
    series_id,
    year,
    sequence_number,
    invoice_date,
    due_date,
    title,
    notes,
    terms_conditions,
    status,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    created_by
  ) VALUES (
    v_quote.company_id,
    v_quote.client_id,
    p_invoice_series_id,
    v_year,
    v_sequence,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_quote.title,
    'Generada desde presupuesto: ' || v_quote.full_quote_number || COALESCE(E'\n\n' || v_quote.notes, ''),
    v_quote.terms_conditions,
    'draft',
    v_quote.subtotal,
    v_quote.tax_amount,
    v_quote.total_amount,
    v_quote.currency,
    v_quote.created_by
  )
  RETURNING id INTO v_invoice_id;
  
  -- Copiar items del presupuesto a la factura
  FOR v_item IN
    SELECT *
    FROM quote_items
    WHERE quote_id = p_quote_id
    ORDER BY line_number
  LOOP
    INSERT INTO invoice_items (
      invoice_id,
      company_id,
      line_number,
      description,
      quantity,
      unit_price,
      tax_rate,
      discount_percent,
      notes
    ) VALUES (
      v_invoice_id,
      v_item.company_id,
      v_item.line_number,
      v_item.description,
      v_item.quantity,
      v_item.unit_price,
      v_item.tax_rate,
      v_item.discount_percent,
      v_item.notes
    );
  END LOOP;
  
  -- Actualizar presupuesto
  UPDATE quotes
  SET 
    invoice_id = v_invoice_id,
    status = 'invoiced',
    invoiced_at = NOW(),
    updated_at = NOW()
  WHERE id = p_quote_id;
  
  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION convert_quote_to_invoice IS 'Convierte un presupuesto aceptado en factura, copiando todos los items';

-- Función: Anonimizar datos de presupuestos antiguos (GDPR)
CREATE OR REPLACE FUNCTION anonymize_quote_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo anonimizar si el periodo de retención ha pasado
  IF OLD.retention_until < CURRENT_DATE AND NOT OLD.is_anonymized THEN
    UPDATE quotes
    SET 
      description = '[ANONIMIZADO]',
      notes = NULL,
      terms_conditions = NULL,
      client_ip_address = NULL,
      client_user_agent = NULL,
      digital_signature = NULL,
      is_anonymized = TRUE,
      anonymized_at = NOW()
    WHERE id = OLD.id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger para anonimización automática
CREATE TRIGGER trigger_anonymize_old_quotes
  AFTER UPDATE ON quotes
  FOR EACH ROW
  WHEN (NEW.retention_until < CURRENT_DATE AND NOT NEW.is_anonymized)
  EXECUTE FUNCTION anonymize_quote_data();

-- Función: Actualizar timestamp de modificación
CREATE OR REPLACE FUNCTION update_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER trigger_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_quotes_updated_at();

CREATE TRIGGER trigger_quote_items_updated_at
  BEFORE UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION update_quotes_updated_at();

CREATE TRIGGER trigger_quote_templates_updated_at
  BEFORE UPDATE ON quote_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_quotes_updated_at();

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;

-- Políticas para quotes
CREATE POLICY quotes_select_policy ON quotes
  FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY quotes_insert_policy ON quotes
  FOR INSERT
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quotes_update_policy ON quotes
  FOR UPDATE
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quotes_delete_policy ON quotes
  FOR DELETE
  USING (company_id = get_user_company_id());

-- Políticas para quote_items
CREATE POLICY quote_items_select_policy ON quote_items
  FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY quote_items_insert_policy ON quote_items
  FOR INSERT
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quote_items_update_policy ON quote_items
  FOR UPDATE
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quote_items_delete_policy ON quote_items
  FOR DELETE
  USING (company_id = get_user_company_id());

-- Políticas para quote_templates
CREATE POLICY quote_templates_select_policy ON quote_templates
  FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY quote_templates_insert_policy ON quote_templates
  FOR INSERT
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quote_templates_update_policy ON quote_templates
  FOR UPDATE
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quote_templates_delete_policy ON quote_templates
  FOR DELETE
  USING (company_id = get_user_company_id());

-- =====================================================
-- 7. GRANTS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON quote_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON quote_templates TO authenticated;

-- =====================================================
-- 8. DATOS INICIALES (Opcional)
-- =====================================================

-- Plantilla de presupuesto básica
-- Se puede activar después de que existan companies
/*
INSERT INTO quote_templates (company_id, name, description, title_template, terms_conditions_template)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Reemplazar con company_id real
  'Plantilla Básica',
  'Plantilla estándar para presupuestos',
  'Presupuesto para {{client_name}}',
  'Este presupuesto es válido por 30 días desde la fecha de emisión. Los precios incluyen IVA.'
);
*/

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================

COMMENT ON SCHEMA public IS 'Sistema de presupuestos con conversión a facturas - Compatible con Veri*Factu';
