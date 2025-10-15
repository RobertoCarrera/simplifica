# 📋 Módulo de Presupuestos - Integración con Invoiless

## 🎯 Descripción

Módulo completo de gestión de presupuestos integrado con la API de Invoiless. Permite crear, editar, listar, enviar por email y eliminar presupuestos de forma sencilla.

## ✨ Características Implementadas

### 1. Servicio Invoiless (`invoiless.service.ts`)
- ✅ Integración completa con API REST de Invoiless
- ✅ Autenticación mediante `api-key` header
- ✅ TypeScript interfaces para type-safety:
  - `InvoilessEstimate` - Estructura del presupuesto
  - `InvoilessCustomer` - Datos del cliente
  - `InvoilessItem` - Conceptos/líneas del presupuesto
  - `InvoilessPaginatedResponse` - Respuesta paginada
  - `InvoilessSendOptions` - Opciones de envío de email

### 2. Operaciones CRUD Completas
- ✅ **CREATE** - `createEstimate()` - Crear nuevos presupuestos
- ✅ **READ** - `getEstimates()` - Lista paginada con búsqueda
- ✅ **READ** - `getEstimate(id)` - Obtener presupuesto específico
- ✅ **UPDATE** - `updateEstimate()` - Actualización completa (PUT)
- ✅ **UPDATE** - `patchEstimate()` - Actualización parcial (PATCH)
- ✅ **DELETE** - `deleteEstimate()` - Eliminar presupuesto
- ✅ **SEND** - `sendEstimate()` - Enviar por email

### 3. Helpers Útiles
- ✅ `calculateItemsTotal()` - Calcula total con IVA y descuentos
- ✅ `formatCustomerForInvoiless()` - Convierte clientes de Simplifica a formato Invoiless

### 4. Componente Angular (`presupuestos.component.ts`)
- ✅ Vista de lista con cards responsive
- ✅ Paginación completa (página actual, total páginas, total registros)
- ✅ Búsqueda por término
- ✅ Modal de creación/edición con formulario completo
- ✅ Selector de clientes existentes desde Supabase
- ✅ Gestión de múltiples conceptos/items
- ✅ Cálculo automático de subtotales y total
- ✅ Modal de envío de email con opciones personalizables
- ✅ Confirmación de eliminación
- ✅ Manejo de errores y mensajes de éxito

### 5. Estados del Presupuesto
- 🟦 **Draft** - Borrador
- 🔵 **Sent** - Enviado
- 🟢 **Accepted** - Aceptado
- 🔴 **Declined** - Rechazado
- 🟠 **Expired** - Expirado

## 📋 Estructura de Archivos

```
src/app/
├── services/
│   └── invoiless.service.ts          # Servicio principal de Invoiless
├── components/
│   └── presupuestos/
│       ├── presupuestos.component.ts     # Lógica del componente
│       ├── presupuestos.component.html   # Template HTML
│       └── presupuestos.component.css    # Estilos CSS
└── environments/
    ├── environment.ts                # Config desarrollo
    └── environment.prod.ts           # Config producción
```

## 🔧 Configuración

### 1. Obtener API Key de Invoiless

1. Acceder a [Invoiless](https://invoiless.com)
2. Ir a **Settings** > **Integrations**
3. Copiar tu **API Key**

### 2. Configurar en Desarrollo

Editar `src/environments/environment.ts`:

```typescript
export const environment = {
  // ... otras configuraciones
  invoilessApiKey: 'TU_API_KEY_AQUI'
};
```

### 3. Configurar en Producción (Vercel)

1. Ir a tu proyecto en Vercel Dashboard
2. **Settings** → **Environment Variables**
3. Agregar nueva variable:
   - **Name**: `INVOILESS_API_KEY`
   - **Value**: Tu API Key de Invoiless
   - **Environment**: Production, Preview, Development

## 🚀 Uso del Módulo

### Desde la UI

1. **Acceder**: Sidebar → 📋 Presupuestos (o navegar a `/presupuestos`)
2. **Crear Presupuesto**: Click en "+ Nuevo Presupuesto"
3. **Seleccionar Cliente**: Dropdown con clientes existentes o completar manualmente
4. **Agregar Conceptos**: 
   - Nombre y descripción
   - Cantidad y precio unitario
   - IVA y descuentos opcionales
5. **Guardar**: El sistema calcula automáticamente los totales
6. **Enviar**: Click en 📧 para enviar por email
7. **Editar**: Click en ✏️ para modificar
8. **Eliminar**: Click en 🗑️ (con confirmación)

### Desde Código

```typescript
import { InvoilessService } from './services/invoiless.service';

// Crear presupuesto
this.invoilessService.createEstimate({
  customer: {
    billTo: {
      company: 'Mi Empresa SL',
      email: 'cliente@example.com',
      name: 'Juan Pérez'
    }
  },
  items: [
    {
      name: 'Servicio de consultoría',
      description: 'Análisis de sistemas',
      quantity: 10,
      price: 50.00,
      tax: 10.50,  // IVA (21%)
      discount: 0
    }
  ],
  notes: 'Válido por 30 días',
  currency: 'EUR'
}).subscribe(estimate => {
  console.log('Presupuesto creado:', estimate);
});

// Listar presupuestos con búsqueda
this.invoilessService.getEstimates(1, 50, 'Mi Empresa').subscribe(response => {
  console.log('Presupuestos:', response.data);
  console.log('Total:', response.pagination.total);
});

// Enviar por email
this.invoilessService.sendEstimate('estimate-id', {
  email: 'cliente@example.com',
  subject: 'Su presupuesto #12345',
  body: 'Adjunto encontrará el presupuesto solicitado.'
}).subscribe(() => {
  console.log('Email enviado');
});
```

## 📡 Endpoints de Invoiless API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/v1/estimates` | Crear presupuesto |
| GET | `/v1/estimates?page=1&limit=50&search=query` | Listar presupuestos |
| GET | `/v1/estimates/:id` | Obtener presupuesto específico |
| PUT | `/v1/estimates/:id` | Actualizar completo |
| PATCH | `/v1/estimates/:id` | Actualización parcial |
| POST | `/v1/estimates/:id/send` | Enviar por email |
| DELETE | `/v1/estimates/:id` | Eliminar presupuesto |

## 🎨 Interfaz de Usuario

### Lista de Presupuestos
- Cards responsive con información del cliente
- Estado visual con badges de color
- Totales destacados en verde
- Acciones rápidas (editar, enviar, eliminar)
- Fecha de vencimiento si existe
- Paginación completa con navegación

### Formulario Crear/Editar
- Selector de clientes existentes de Supabase
- Formulario completo del cliente (empresa, email, teléfono, dirección)
- Gestión dinámica de conceptos/items
- Cálculo en tiempo real de subtotales y total
- Campos para notas y términos
- Selector de estado y moneda
- Validación de campos requeridos

### Modal de Envío
- Email del destinatario (prellenado si existe)
- Asunto personalizable
- Cuerpo del mensaje
- Fecha del envío

## 🔒 Seguridad

- ✅ Protección de rutas con `AuthGuard`
- ✅ API Key nunca expuesta en cliente (solo en variables de entorno)
- ✅ Validación de API Key antes de cada petición
- ✅ Manejo de errores con mensajes claros
- ✅ HTTPS obligatorio (Invoiless API requirement)

## 🐛 Manejo de Errores

El servicio detecta y maneja:
- ❌ API Key no configurada
- ❌ Errores de red (CORS, timeouts)
- ❌ Errores del servidor (400, 401, 500, etc.)
- ❌ Rate limiting
- ❌ Datos inválidos

Todos los errores se muestran en la UI con mensajes claros.

## 🧪 Testing

Para probar el módulo:

1. **Configurar API Key** en `environment.ts`
2. **Ejecutar**: `npm start`
3. **Navegar** a `/presupuestos`
4. **Crear presupuesto de prueba**:
   - Seleccionar cliente existente
   - Agregar 2-3 conceptos
   - Revisar cálculos automáticos
   - Guardar
5. **Probar búsqueda** con diferentes términos
6. **Probar paginación** si tienes más de 50 presupuestos
7. **Probar envío de email** (se enviará email real)
8. **Probar edición** de presupuesto existente
9. **Probar eliminación** con confirmación

## 📚 Documentación API

- [Invoiless API Docs](https://docs.invoiless.com)
- [Intro](https://docs.invoiless.com/docs/intro)
- [Estimates Endpoint](https://docs.invoiless.com/docs/estimates)

## 🎯 Próximas Mejoras

- [ ] Convertir presupuesto a factura
- [ ] Duplicar presupuesto existente
- [ ] Exportar presupuesto a PDF
- [ ] Historial de cambios de estado
- [ ] Plantillas de presupuestos
- [ ] Notificaciones cuando cliente acepta/rechaza
- [ ] Dashboard de estadísticas de presupuestos
- [ ] Recordatorios automáticos de vencimiento

## 🔗 Integración con Simplifica

El módulo está completamente integrado:
- ✅ Ruta en `app.routes.ts`
- ✅ Enlace en sidebar
- ✅ Usa clientes de Supabase
- ✅ Misma autenticación y guards
- ✅ Estilos coherentes con la app
- ✅ Multi-tenant compatible

## 💡 Ejemplo de Flujo Completo

```typescript
// 1. Usuario entra a /presupuestos
// 2. Se cargan presupuestos desde Invoiless (paginados)
// 3. Usuario click en "+ Nuevo Presupuesto"
// 4. Selecciona cliente existente de dropdown (de Supabase)
// 5. Se prellenan datos del cliente automáticamente
// 6. Agrega 3 conceptos:
//    - "Instalación sistema" - 1x 500€ + 105€ IVA = 605€
//    - "Mantenimiento mensual" - 12x 50€ + 126€ IVA = 726€
//    - "Formación" - 4x 75€ + 63€ IVA = 363€
// 7. Total: 1.694€
// 8. Agrega nota: "Válido 30 días"
// 9. Guarda → Presupuesto creado en Invoiless
// 10. Click en 📧 → Envía email al cliente
// 11. Email recibido con presupuesto adjunto
// 12. Cliente acepta → Cambia estado a "Accepted"
```

---

**✅ Módulo completamente funcional y listo para usar**
