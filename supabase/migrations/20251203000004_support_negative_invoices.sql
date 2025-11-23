-- Modificar constraints para permitir valores negativos (necesario para facturas rectificativas)

-- 1. Tabla QUOTES: Permitir subtotal, impuestos y total negativos
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS valid_totals;
-- Opcional: Agregar validación de consistencia matemática en lugar de positividad
ALTER TABLE public.quotes ADD CONSTRAINT valid_totals_consistency CHECK (total_amount = subtotal + tax_amount);

-- 2. Tabla QUOTE_ITEMS: Permitir cantidades negativas
ALTER TABLE public.quote_items DROP CONSTRAINT IF EXISTS valid_quantity;
ALTER TABLE public.quote_items ADD CONSTRAINT valid_quantity_nonzero CHECK (quantity <> 0);

-- 3. Tabla INVOICE_ITEMS: Permitir cantidades negativas (para cuando se convierta la rectificativa)
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS valid_quantity;
ALTER TABLE public.invoice_items ADD CONSTRAINT valid_quantity_nonzero CHECK (quantity <> 0);

-- 4. Tabla INVOICES: Ajustar validación de pagos para permitir importes negativos
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS valid_paid_amount;

ALTER TABLE public.invoices ADD CONSTRAINT valid_paid_amount_logic CHECK (
  (total >= 0 AND paid_amount >= 0 AND paid_amount <= total) OR
  (total < 0 AND paid_amount <= 0 AND paid_amount >= total)
);
