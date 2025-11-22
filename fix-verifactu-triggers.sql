-- ============================================
-- SOLUCIÓN COMPLETA: Triggers VeriFactu
-- ============================================
-- Crea automáticamente metadata y eventos cuando se crea/actualiza/anula una factura

-- 1. Función que maneja la creación de metadata y eventos
CREATE OR REPLACE FUNCTION verifactu.handle_invoice_verifactu()
RETURNS TRIGGER AS $$
BEGIN
  -- Cuando se INSERTA una nueva factura
  IF (TG_OP = 'INSERT') THEN
    -- Crear metadata con todos los campos requeridos
    INSERT INTO verifactu.invoice_meta (
      invoice_id, 
      company_id, 
      series, 
      number, 
      issue_time, 
      chained_hash, 
      status, 
      created_at, 
      updated_at
    )
    SELECT 
      NEW.id,
      NEW.company_id,
      COALESCE(s.series_code, 'UNKNOWN'),
      COALESCE(
        (regexp_match(NEW.invoice_number, '\d+$'))[1]::bigint,
        1
      ),
      COALESCE(NEW.created_at, NOW()),
      'PENDING_HASH',  -- Se generará al procesar el evento
      'pending',
      NOW(),
      NOW()
    FROM invoice_series s
    WHERE s.id = NEW.series_id
    ON CONFLICT (invoice_id) DO NOTHING;
    
    -- Crear evento de alta
    INSERT INTO verifactu.events (invoice_id, company_id, event_type, status, payload, attempts, created_at)
    VALUES (
      NEW.id,
      NEW.company_id,
      'alta', 
      'pending', 
      jsonb_build_object(
        'invoice_number', NEW.invoice_number,
        'total', NEW.total,
        'created_at', NEW.created_at
      ),
      0,
      NOW()
    );
    
  -- Cuando se ACTUALIZA una factura existente
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Si se marca como anulada (state = 'void' o status = 'cancelled')
    IF (NEW.state = 'void' OR NEW.status = 'cancelled') AND 
       (OLD.state IS DISTINCT FROM 'void' AND OLD.status IS DISTINCT FROM 'cancelled') THEN
      -- Actualizar metadata a void
      UPDATE verifactu.invoice_meta 
      SET status = 'void', updated_at = NOW()
      WHERE invoice_id = NEW.id;
      
      -- Crear evento de anulación
      INSERT INTO verifactu.events (invoice_id, company_id, event_type, status, payload, attempts, created_at)
      VALUES (
        NEW.id,
        NEW.company_id,
        'anulacion',
        'pending',
        jsonb_build_object(
          'invoice_number', NEW.invoice_number,
          'state', NEW.state,
          'status', NEW.status::text,
          'reason', 'Invoice voided/cancelled'
        ),
        0,
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Crear el trigger en la tabla invoices
DROP TRIGGER IF EXISTS trigger_invoice_verifactu ON public.invoices;

CREATE TRIGGER trigger_invoice_verifactu
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION verifactu.handle_invoice_verifactu();

-- 3. Procesar facturas existentes que no tienen metadata ni eventos
INSERT INTO verifactu.invoice_meta (
  invoice_id, 
  company_id, 
  series, 
  number, 
  issue_time, 
  chained_hash, 
  status, 
  created_at, 
  updated_at
)
SELECT 
  i.id,
  i.company_id,
  COALESCE(s.series_code, 'UNKNOWN'),
  COALESCE(
    (regexp_match(i.invoice_number, '\d+$'))[1]::bigint,
    1
  ),
  COALESCE(i.created_at, NOW()),
  'PENDING_HASH',
  CASE 
    WHEN i.state = 'void' OR i.status = 'cancelled' THEN 'void'
    ELSE 'pending'
  END as status,
  i.created_at,
  NOW()
FROM public.invoices i
LEFT JOIN verifactu.invoice_meta im ON im.invoice_id = i.id
LEFT JOIN invoice_series s ON s.id = i.series_id
WHERE im.invoice_id IS NULL;

-- 4. Crear eventos para facturas existentes que no los tienen
INSERT INTO verifactu.events (invoice_id, company_id, event_type, status, payload, attempts, created_at)
SELECT 
  i.id,
  i.company_id,
  CASE 
    WHEN i.state = 'void' OR i.status = 'cancelled' THEN 'anulacion'
    ELSE 'alta'
  END as event_type,
  'pending',
  jsonb_build_object(
    'invoice_number', i.invoice_number,
    'total', i.total,
    'created_at', i.created_at,
    'state', i.state,
    'status', i.status::text,
    'backfilled', true
  ),
  0,
  NOW()
FROM public.invoices i
LEFT JOIN verifactu.events e ON e.invoice_id = i.id
WHERE e.id IS NULL;

-- 5. Verificar resultados
SELECT 
  'Metadata creada' as tipo,
  COUNT(*) as total
FROM verifactu.invoice_meta
UNION ALL
SELECT 
  'Eventos creados' as tipo,
  COUNT(*) as total
FROM verifactu.events
UNION ALL
SELECT 
  'Eventos pendientes' as tipo,
  COUNT(*) as total
FROM verifactu.events
WHERE status = 'pending';
