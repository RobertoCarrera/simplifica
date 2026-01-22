# Reporte de Auditoría de Seguridad - Simplifica CRM (Marzo 2026)

## Resumen Ejecutivo
Se ha realizado una auditoría de seguridad centrada en la capa de datos (RLS), Edge Functions y lógica financiera. Se han identificado **3 hallazgos significativos**, de los cuales 1 es de criticidad **CRÍTICA** y 2 de criticidad **ALTA**.

## Hallazgos

### 1. [CRÍTICO] Ejecución no autenticada en `process-inbound-email`
*   **Archivo:** `supabase/functions/process-inbound-email/index.ts`
*   **Descripción:** La Edge Function utiliza `SUPABASE_SERVICE_ROLE_KEY` para insertar correos directamente en la base de datos, saltándose RLS. Sin embargo, no existe ninguna validación de autenticación ni secreto compartido (Webhook Secret).
*   **Impacto:** Un atacante puede invocar esta función públicamente e inyectar correos falsos, spam o phishing en las bandejas de entrada de los usuarios, o realizar ataques de denegación de servicio (DoS) llenando la base de datos.
*   **Mitigación Propuesta:** Implementar validación de `WEBHOOK_SECRET` mediante cabecera HTTP.

### 2. [ALTA] Corrupción de integridad financiera en `convert_quote_to_invoice`
*   **Archivo:** `supabase/migrations/20260129160000_finance_security_logic.sql` (función DB)
*   **Descripción:** Al convertir un presupuesto a factura, la función `convert_quote_to_invoice` inserta los ítems de la factura hardcodeando el `tax_rate` a `0`, ignorando el impuesto definido en el presupuesto.
*   **Impacto:** Generación de facturas fiscalmente incorrectas, pérdida de integridad de datos financieros y posibles problemas legales para los tenants.
*   **Mitigación Propuesta:** Modificar la función para copiar el `tax_rate` desde `quote_items` a `invoice_items`.

### 3. [ALTA] Restricciones de acceso público en sistema de Reservas (`bookings`)
*   **Archivo:** `supabase/migrations/20260110210000_create_booking_system.sql`
*   **Descripción:** Las tablas `booking_types` y `bookings` tienen políticas RLS que restringen el acceso SELECT e INSERT únicamente a miembros de la compañía (`authenticated` + check de `company_members`).
*   **Impacto:** Si el sistema de reservas está diseñado para clientes públicos (externos), estos no podrán ver los servicios disponibles ni crear reservas, rompiendo la funcionalidad principal del módulo de citas.
*   **Mitigación Propuesta:** (Pendiente de validación de requisitos de negocio) Habilitar políticas `TO public` para SELECT en `booking_types` (activos) e INSERT en `bookings` con validaciones estrictas.

## Próximos Pasos
Se procederá a corregir inmediatamente los hallazgos 1 y 2 mediante Pull Requests separados.
