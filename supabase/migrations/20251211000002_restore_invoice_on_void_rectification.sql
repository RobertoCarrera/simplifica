-- Crear trigger para restaurar el estado de la factura original al anular una rectificativa

BEGIN;

-- Función que se ejecuta cuando se anula una factura
CREATE OR REPLACE FUNCTION public.restore_original_invoice_on_void()
RETURNS TRIGGER AS $$
DECLARE
  v_original_invoice_id UUID;
  v_has_other_valid_rectifications BOOLEAN;
BEGIN
  -- Solo actuar si la factura está siendo anulada (void)
  IF NEW.status = 'void' AND OLD.status != 'void' THEN
    
    -- Verificar si esta factura es una rectificativa
    IF NEW.rectifies_invoice_id IS NOT NULL THEN
      v_original_invoice_id := NEW.rectifies_invoice_id;
      
      -- Comprobar si hay otras facturas rectificativas válidas para esta factura original
      SELECT EXISTS(
        SELECT 1 
        FROM public.invoices 
        WHERE rectifies_invoice_id = v_original_invoice_id 
          AND id != NEW.id
          AND status NOT IN ('void', 'cancelled')
      ) INTO v_has_other_valid_rectifications;
      
      -- Si no hay otras rectificativas válidas, restaurar el estado de la original
      IF NOT v_has_other_valid_rectifications THEN
        UPDATE public.invoices
        SET 
          status = 'approved',
          updated_at = NOW()
        WHERE id = v_original_invoice_id
          AND status = 'rectified';
          
        RAISE NOTICE 'Factura original % restaurada a estado approved', v_original_invoice_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger (si no existe, DROP IF EXISTS para recrearlo)
DROP TRIGGER IF EXISTS trg_restore_original_on_void ON public.invoices;

CREATE TRIGGER trg_restore_original_on_void
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void')
  EXECUTE FUNCTION public.restore_original_invoice_on_void();

COMMENT ON FUNCTION public.restore_original_invoice_on_void() IS 
'Restaura el estado de una factura original de "rectified" a "approved" cuando se anula su factura rectificativa, permitiendo crear una nueva rectificación';

COMMIT;
