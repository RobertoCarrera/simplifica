-- EJECUTAR EN: https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/sql/new
-- Añade la opción de pago en local a company_settings

-- Añadir columna para permitir pago en local
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS allow_local_payment BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.company_settings.allow_local_payment IS 'Permite a los clientes registrar pagos en efectivo/local';

-- Actualizar el constraint de payment_status para incluir pending_local
-- Primero eliminamos el constraint existente si existe
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'invoices' 
    AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
  END IF;
END $$;

-- Añadir el nuevo constraint con pending_local
ALTER TABLE public.invoices 
ADD CONSTRAINT invoices_payment_status_check 
CHECK (payment_status IN ('pending', 'pending_local', 'partial', 'paid', 'refunded', 'cancelled'));

-- Verificar que se añadieron las columnas
SELECT 'company_settings.allow_local_payment' as check_item, 
       column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'company_settings' 
  AND column_name = 'allow_local_payment';
