# Plan de Migración de Edge Functions a SQL (RPC)

Este documento clasifica las Edge Functions actuales del proyecto para identificar cuáles deben ser migradas a funciones nativas de PostgreSQL (RPC) para mejorar rendimiento, seguridad y mantenibilidad.

## 🚨 Prioridad Alta: Migrar a SQL (RPC)
Estas funciones realizan operaciones de lectura/escritura simples o agregaciones que PostgreSQL realiza de forma nativa mucho más eficiente.

- [x] **`top-products`** (Migrado a `get_top_products` RPC. Archivo: `20260218160000_migrate_top_products.sql`).
- [x] **`reorder-stages`** (Migrado a `reorder_stages` RPC. Archivo: `20260218163000_migrate_reorder_stages.sql`).
- [x] **`hide-stage`** (Migrado a `toggle_stage_visibility` RPC. Archivo: `20260218170000_migrate_config_visibility.sql`).
- [x] **`get-config-stages`** (Migrado a `get_company_config_stages` RPC. Archivo: `20260218170000_migrate_config_visibility.sql`).
- [x] **`hide-unit`** (Migrado a `toggle_unit_visibility` RPC. Archivo: `20260218170000_migrate_config_visibility.sql`).
- [x] **`get-config-units`** (Migrado a `get_company_config_units` RPC. Archivo: `20260218170000_migrate_config_visibility.sql`).
- [x] **`create-address`** (Migrado a `create_address_rpc`. Archivo: `20260218173000_migrate_simple_cruds.sql`).
- [x] **`create-device`** (Migrado a `create_device_rpc`. Archivo: `20260218173000_migrate_simple_cruds.sql`).
- [x] **`create-locality`** (Migrado a `create_locality_rpc`. Archivo: `20260218173000_migrate_simple_cruds.sql`).
- [x] **`create-service-variant`** (Migrado a `create_service_variant_rpc`. Archivo: `20260218173000_migrate_simple_cruds.sql`).
- [x] **`create-ticket`** (Migrado a `create_ticket_rpc`. Archivo: `20260218180000_migrate_complex_cruds.sql`).
- [ ] **`create-invited-user`** (Mantener como Edge Function. Requiere interacción con Auth Admin API y generación de passwords).
- [x] **`upsert-client`** (Migrado a `upsert_client_rpc`. Archivo: `20260218180000_migrate_complex_cruds.sql`).
- [x] **`link-ticket-device`** (Migrado a `link_ticket_device`. Archivo: `20260218180000_migrate_complex_cruds.sql`).
- [x] **`list-company-devices`** (Migrado a `list_company_devices_rpc`. Archivo: `20260218183000_migrate_high_priority.sql`).
- [x] **`remove-or-deactivate-client`** (Migrado a `remove_or_deactivate_client_rpc`. Archivo: `20260218183000_migrate_high_priority.sql`).
- [x] **`delete-stage-safe`** (Migrado a `delete_stage_safe_rpc`. Archivo: `20260218183000_migrate_high_priority.sql`).
- [x] **`client-invoices`** (Migrado a `get_client_invoices_rpc` / `mark_invoice_local_payment_rpc`. Archivo: `20260218190000_migrate_client_functions.sql`).
- [x] **`client-quotes`** (Migrado a `get_client_quotes_rpc`. Archivo: `20260218190000_migrate_client_functions.sql`).

## ⚠️ Zona Gris: Evaluar Complejidad
Dependen de si realizan validaciones externas o lógica muy compleja difícil de portar a PL/pgSQL.

- [ ] **`verifactu-dispatcher`** (Evaluado: Mantener. Complejidad criptográfica y XML).
- [ ] **`import-customers`** (Evaluado: Mantener. Parsing y validación compleja).
- [ ] **`import-services`** (Posible RPC simple, pero baja prioridad).
- [ ] **`process-client-consent`** (Si solo DB: SQL. Si envía emails/notificaciones: Edge o SQL+Trigger).
- [ ] **`send-client-consent-invite`** (Envío de email -> Edge).

## ✅ Mantener como Edge Functions (Node/Deno)
Requieren librerías externas, llamadas HTTP a terceros, o procesamiento de archivos pesados.

- [ ] **Integraciones de Pago** (`create-payment-link`, `payment-webhook-*`).
- [ ] **Gestión de Emails** (`send-email`, `invoices-email`, `quotes-email`).
- [ ] **Generación de PDFs** (`invoices-pdf`, `quotes-pdf`).
- [ ] **Integraciones IA** (`ai-request`, `anychat`).
- [ ] **AWS S3 / Utils** (`aws-domains`, `aws-manager`).
- [ ] **Verifactu Cert** (`upload-verifactu-cert` - Crypto/Files).
- [ ] **Google Auth** (`google-auth`).

---

## Ejecución
1.  **Fase 1**: `top-products` (Agregación pesada).
2.  **Fase 2**: Configuración (`reorder-stages`, `get/hide` config).
3.  **Fase 3**: CRUDs simples (`create-*`, `upsert-*`).
