# Guía de Pruebas de Pagos - Stripe y PayPal

Esta documentación describe cómo realizar pruebas de pagos en el sistema usando las plataformas de prueba de Stripe y PayPal.

## Requisitos Previos

1. Tener configurada una integración de pago en **Configuración > Integraciones > Pagos Online**
2. La empresa debe tener al menos una de las integraciones activas (Stripe y/o PayPal)
3. Para pruebas, usar las credenciales de **modo test/sandbox**

---

## 🟣 Stripe Test Mode

### Configuración del modo test

En el dashboard de Stripe (dashboard.stripe.com):
1. Activar el toggle **"Test mode"** (arriba a la derecha)
2. Ir a **Developers > API Keys**
3. Copiar las claves **Publishable key** y **Secret key** del modo test
4. En Simplifica, configurar la integración con estas claves de prueba

### Tarjetas de Prueba de Stripe

| Número de Tarjeta | Escenario | CVC | Fecha |
|-------------------|-----------|-----|-------|
| `4242 4242 4242 4242` | ✅ Pago exitoso | Cualquiera (ej: 123) | Cualquier fecha futura |
| `4000 0025 0000 3155` | 🔐 Requiere autenticación 3D Secure | Cualquiera | Cualquier fecha futura |
| `4000 0000 0000 3220` | 🔐 3D Secure 2 requerido | Cualquiera | Cualquier fecha futura |
| `4000 0000 0000 9995` | ❌ Pago rechazado (fondos insuficientes) | Cualquiera | Cualquier fecha futura |
| `4000 0000 0000 9987` | ❌ Tarjeta robada | Cualquiera | Cualquier fecha futura |
| `4000 0000 0000 0002` | ❌ Tarjeta declinada | Cualquiera | Cualquier fecha futura |
| `4000 0000 0000 0069` | ❌ Tarjeta expirada | Cualquiera | Cualquier fecha futura |
| `4000 0000 0000 0127` | ❌ CVC incorrecto | Cualquiera | Cualquier fecha futura |

### Datos adicionales para pruebas

- **Email**: Cualquier email válido
- **Nombre**: Cualquier nombre
- **Código Postal**: Cualquier código (ej: 28001)
- **País**: España u otro

### Prueba de suscripciones (servicios recurrentes)

Para probar pagos recurrentes:
1. Crear un servicio con **"Es recurrente"** activado
2. El cliente solicita y contrata el servicio
3. Se creará una suscripción en Stripe en lugar de un pago único

---

## 🔵 PayPal Sandbox Mode

### Configuración del modo sandbox

En PayPal Developer (developer.paypal.com):
1. Ir a **Dashboard > My Apps & Credentials**
2. Seleccionar **Sandbox** en el toggle
3. Crear una nueva app o usar una existente
4. Copiar **Client ID** y **Secret**
5. En Simplifica, configurar la integración marcando **"Modo Sandbox"**

### Cuentas de Prueba de PayPal

PayPal proporciona cuentas sandbox automáticamente:
1. Ir a **Sandbox > Accounts** en developer.paypal.com
2. Verás cuentas Business y Personal de prueba

#### Cuenta Personal (para pagar)
- **Email**: Usar el email de la cuenta Personal de sandbox
- **Contraseña**: Ver en "View/Edit account"
- **Balance**: Normalmente $9,999.00 de prueba

#### Cuenta Business (para recibir)
- Es la cuenta configurada con las credenciales de tu app

### Proceso de prueba con PayPal

1. El cliente hace clic en "Pagar con PayPal"
2. Se abre la página de PayPal Sandbox
3. Iniciar sesión con la cuenta Personal de sandbox
4. Confirmar el pago
5. Redirección de vuelta a Simplifica
6. El webhook actualiza el estado de la factura

---

## 🧪 Flujo de Prueba Completo

### Paso 1: Configurar integraciones de prueba

```
Panel Admin > Configuración > Integraciones > Pagos Online
```

1. **Stripe Test**:
   - API Key: `pk_test_...`
   - Secret Key: `sk_test_...`
   - ✅ Activo

2. **PayPal Sandbox**:
   - Client ID: `AW...` (del sandbox)
   - Client Secret: `EK...` (del sandbox)
   - ✅ Modo Sandbox
   - ✅ Activo

### Paso 2: Crear un servicio de prueba

```
Panel Admin > Servicios > Nuevo Servicio
```

- Título: "Servicio de Prueba"
- Precio: 10.00 €
- Visible: Público
- Variantes: Opcional

### Paso 3: Solicitar el servicio como cliente

1. Entrar al **Portal del Cliente** (login como cliente)
2. Ir a **Servicios**
3. Hacer clic en "Solicitar" en el servicio de prueba
4. Aceptar los términos
5. Elegir método de pago (si hay ambos configurados)

### Paso 4: Completar el pago

**Con Stripe:**
1. Se abre Stripe Checkout
2. Usar tarjeta: `4242 4242 4242 4242`
3. Completar con cualquier fecha futura y CVC
4. Clic en "Pagar"

**Con PayPal:**
1. Se abre PayPal Sandbox
2. Login con cuenta Personal de sandbox
3. Confirmar pago

### Paso 5: Verificar el resultado

1. La factura debe cambiar a **"Pagada"**
2. El presupuesto asociado debe estar **"Aceptado"**
3. Verificar en panel admin que los estados se actualizaron

---

## 🔍 Depuración

### Ver logs de webhooks

**Stripe:**
- Dashboard Stripe > Developers > Webhooks > Ver eventos recientes

**PayPal:**
- Dashboard PayPal Developer > Sandbox > Notifications

### Verificar en Supabase

```sql
-- Ver estado de factura
SELECT id, invoice_number, payment_status, payment_link_provider, 
       stripe_payment_url, paypal_payment_url
FROM invoices 
WHERE id = 'ID_DE_LA_FACTURA';

-- Ver eventos de webhook
SELECT * FROM stripe_webhook_events ORDER BY created_at DESC LIMIT 10;
```

### Logs de Edge Functions

En Supabase Dashboard > Edge Functions > Logs:
- `client-request-service`: Generación de pagos
- `payment-webhook-stripe`: Webhooks de Stripe
- `payment-webhook-paypal`: Webhooks de PayPal

---

## ⚠️ Notas Importantes

1. **No usar datos reales de tarjetas en modo test** - Stripe las rechazará
2. **Los pagos en sandbox no son reales** - No hay transferencias de dinero
3. **Verificar siempre el modo** - Asegurarse de estar en test/sandbox antes de probar
4. **Webhooks locales** - Para desarrollo local, usar Stripe CLI o PayPal webhooks en modo sandbox
5. **Expiración de links** - Los enlaces de pago expiran en 7 días

---

## 📋 Checklist de Pruebas

- [ ] Pago único con Stripe exitoso
- [ ] Pago único con PayPal exitoso
- [ ] Pago fallido con tarjeta declinada
- [ ] Pago con 3D Secure
- [ ] Cambio de método de pago (elegir PayPal después de iniciar con Stripe)
- [ ] Suscripción recurrente con Stripe
- [ ] Verificar webhook actualiza estado de factura
- [ ] Verificar que Verifactu se emite tras pago exitoso (si configurado)

---

## 🔗 Enlaces Útiles

- [Stripe Test Cards](https://stripe.com/docs/testing#cards)
- [Stripe CLI para webhooks locales](https://stripe.com/docs/stripe-cli)
- [PayPal Sandbox](https://developer.paypal.com/docs/api-basics/sandbox/)
- [PayPal Sandbox Accounts](https://developer.paypal.com/dashboard/accounts)
