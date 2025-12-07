# Checklist: Módulos y Facturación Independiente de Verifactu

## Resumen de Cambios

El sistema actual tiene módulos (moduloFacturas, moduloPresupuestos, etc.) pero faltan:
- **moduloChat**: para controlar acceso a `/chat`
- **moduloVerifactu**: para separar Verifactu de Facturación

### Lógica de Negocio

| Módulos Activos | Comportamiento |
|-----------------|----------------|
| Solo Facturación | Facturación normal con PayPal/Stripe. Sin envío a AEAT |
| Solo Verifactu | Solo envío a AEAT. Usuario factura con otro programa |
| Facturación + Verifactu | Facturación completa + envío automático a AEAT |
| Ninguno | Sin acceso al módulo de facturación |

---

## Checklist de Tareas

### Fase 1: Catálogo de Módulos (BD)
- [x] Analizar estructura actual de módulos
- [x] **1.1** Crear migración para añadir `moduloChat` al catálogo
- [x] **1.2** Crear migración para añadir `moduloVerifactu` al catálogo
- [x] **1.3** Verificar que `moduloFacturas` existe en el catálogo

### Fase 2: Control de Acceso por Módulos
- [x] **2.1** Añadir `ModuleGuard` a la ruta `/chat` con `moduleKey: 'moduloChat'`
- [x] **2.2** Verificar que `/facturacion` ya tiene `ModuleGuard` con `moduloFacturas`
- [ ] **2.3** Actualizar sidebar/menú móvil para ocultar Chat si módulo desactivado

### Fase 3: Configuración de Facturación
- [x] **3.1** Crear tabla `payment_integrations` para credenciales PayPal/Stripe
- [x] **3.2** Crear componente `billing-settings` en `/configuracion/facturacion`
- [x] **3.3** Implementar formulario de integración PayPal
- [x] **3.4** Implementar formulario de integración Stripe
- [x] **3.5** Añadir indicadores de estado de conexión

### Fase 4: Separación Facturación/Verifactu
- [x] **4.1** Modificar `invoice-detail` para mostrar/ocultar sección Verifactu según módulo
- [x] **4.2** Modificar proceso de finalización de factura:
  - Si `moduloVerifactu` activo → enviar a AEAT
  - Si solo `moduloFacturas` → marcar como finalizada sin Verifactu
- [x] **4.3** Actualizar `invoice-list` para mostrar/ocultar dispatcher health según módulo
- [ ] **4.4** Ocultar configuración de Verifactu si módulo desactivado

### Fase 5: Integraciones de Pago (Backend)
- [x] **5.1** Crear Edge Function para CRUD de integraciones (`payment-integrations`)
- [x] **5.2** Crear Edge Function para test de conexión (`payment-integrations-test`)
- [ ] **5.3** Crear Edge Function para procesar pagos (webhook handlers)
- [x] **5.4** Añadir campo `payment_status` a facturas (en migración)
- [x] **5.5** Añadir campo `payment_method` a facturas (en migración)
- [x] **5.6** Añadir campo `payment_link_token` a facturas (en migración)

### Fase 6: UI de Pagos en Facturas
- [ ] **6.1** Añadir botón "Enviar enlace de pago" en `invoice-detail`
- [ ] **6.2** Crear página de pago público para clientes
- [ ] **6.3** Mostrar estado de pago en listado de facturas
- [ ] **6.4** Notificaciones cuando se recibe un pago

### Fase 7: Actualización de Configuración
- [x] **7.1** Añadir sección "Facturación" en `/configuracion`
- [ ] **7.2** Añadir sección "Chat" en `/configuracion` (si aplica)
- [ ] **7.3** Mover configuración Verifactu bajo condicional de módulo
- [ ] **7.4** Actualizar navegación según módulos activos

---

## Archivos Creados/Modificados

### Nuevos Archivos (Creados ✅)
```
src/app/components/billing-settings/
  ├── billing-settings.component.ts     ✅
  └── billing-settings.component.html   ✅

src/app/services/
  └── payment-integrations.service.ts   ✅

supabase/migrations/
  ├── 20251207_add_chat_verifactu_modules.sql   ✅
  └── 20251207_payment_integrations.sql         ✅

supabase/functions/
  ├── payment-integrations/index.ts       ✅
  └── payment-integrations-test/index.ts  ✅
```

### Archivos Modificados (✅)
```
src/app/app.routes.ts                                    ✅ ModuleGuard en /chat
src/app/components/configuracion/configuracion.component.html  ✅ Card Facturación
src/app/modules/invoices/invoice-detail/invoice-detail.component.ts  ✅ Ocultar Verifactu
src/app/modules/invoices/invoice-list/invoice-list.component.ts      ✅ Ocultar dispatcher
supabase/edge-functions/convert-quote-to-invoice/index.ts ✅ Verificar módulo
```

### Archivos Pendientes
```
src/app/components/mobile-bottom-nav/    - Filtrar por módulos
src/app/utils/responsive-sidebar/        - Filtrar por módulos
supabase/functions/payment-webhook/      - Webhook PayPal/Stripe
```

---

## Notas de Implementación

### PayPal Integration
- Usar PayPal REST API v2
- Modo Sandbox para desarrollo
- Guardar `client_id` y `client_secret` encriptados

### Stripe Integration
- Usar Stripe API
- Modo Test para desarrollo
- Guardar `publishable_key` y `secret_key` encriptados

### Seguridad
- Las credenciales de pago se almacenan encriptadas en BD
- Solo owner/admin pueden configurar integraciones
- Los webhooks validan firma/origen
