-- EJECUTAR EN: https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/sql/new
-- Este script genera un token de pago para la factura que no lo tiene

-- Primero verificamos qué facturas tienen payment_status='pending' pero sin payment_link_token
SELECT id, full_invoice_number, invoice_number, payment_status, payment_link_token, payment_link_expires_at
FROM invoices 
WHERE payment_status = 'pending' 
  AND (payment_link_token IS NULL OR payment_link_token = '');

-- Genera un token aleatorio para la factura específica (2025-F-00111)
-- Si hay varias facturas sin token, este script actualizará todas
UPDATE invoices
SET 
  payment_link_token = encode(gen_random_bytes(24), 'hex'),
  payment_link_expires_at = NOW() + INTERVAL '7 days'
WHERE payment_status = 'pending' 
  AND (payment_link_token IS NULL OR payment_link_token = '');

-- Verificar que se actualizó correctamente
SELECT id, full_invoice_number, invoice_number, payment_status, payment_link_token, payment_link_expires_at
FROM invoices 
WHERE payment_status = 'pending';
