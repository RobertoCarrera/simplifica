-- 1. Verificar si existe el esquema 'verifactu'
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name = 'verifactu';

-- 2. Verificar las tablas dentro del esquema 'verifactu'
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema = 'verifactu';

-- 3. Verificar columnas de 'verifactu.events' (para asegurar que coinciden con lo que espera la función)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'verifactu' AND table_name = 'events'
ORDER BY ordinal_position;

-- 4. Verificar columnas de 'verifactu.invoice_meta'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'verifactu' AND table_name = 'invoice_meta'
ORDER BY ordinal_position;

-- 5. Verificar si existen facturas en la tabla pública 'invoices'
SELECT count(*) as total_invoices FROM public.invoices;

-- 6. Verificar si hay eventos pendientes de procesar
-- Si esta tabla no existe, dará error, confirmando el problema.
SELECT count(*) as pending_events, status 
FROM verifactu.events 
GROUP BY status;

-- 7. Verificar Políticas RLS (Row Level Security)
-- A veces el usuario no ve datos porque RLS los oculta, aunque la tabla exista.
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies 
WHERE schemaname = 'verifactu' OR tablename = 'invoices';

-- 8. Muestra las últimas 5 filas de eventos para ver si se están creando correctamente
SELECT * FROM verifactu.events ORDER BY created_at DESC LIMIT 5;
