# Portal de Presupuestos - Resumen de Mejoras Implementadas

## 📋 Resumen Ejecutivo

Se han implementado mejoras significativas en el portal de clientes para presupuestos, incluyendo:

1. ✅ **Navegación mejorada desde email**: Corrección del flujo de returnUrl después del login
2. ✅ **UI moderna y responsive**: Diseño completamente renovado con mejor UX
3. ✅ **Botones Aceptar/Rechazar**: Funcionalidad completa para responder a presupuestos
4. ✅ **Modal de confirmación**: Experiencia de usuario mejorada con confirmaciones
5. ✅ **Edge Function segura**: `client-quote-respond` con validación completa

---

## 🔧 Cambios Implementados

### 1. Login Component - Navegación returnUrl Mejorada

**Archivo**: `src/app/components/login/login.component.ts`

**Problema anterior**:
- `history.replaceState()` interfería con la navegación
- El flujo de returnUrl podría fallar en algunos casos

**Solución**:
```typescript
// Navegación directa sin manipulación del historial
if (returnTo) {
  let normalized = decodeURIComponent(returnTo);
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  console.log('🔀 Navigating to returnUrl:', normalized);
  await this.router.navigateByUrl(normalized);
} else {
  console.log('🔀 No returnUrl, navigating to /inicio');
  await this.router.navigate(['/inicio']);
}
```

**Beneficios**:
- ✅ Navegación más robusta
- ✅ Mejor logging para debugging
- ✅ Manejo de errores mejorado
- ✅ Compatible con deep links desde email

---

### 2. Portal Quote Detail - UI Completamente Renovada

**Archivo**: `src/app/components/portal-quote-detail/portal-quote-detail.component.ts`

#### Mejoras Visuales

**Antes**:
- Diseño básico con bordes simples
- Sin separación clara de secciones
- Total poco destacado
- Sin acciones disponibles

**Ahora**:
- 🎨 **Layout moderno** con fondo degradado
- 📱 **100% responsive** (mobile-first)
- 🃏 **Cards con sombras** y hover effects
- 📊 **Tabla mejorada** con mejor espaciado
- 💰 **Total destacado** con tipografía grande
- ✨ **Animaciones suaves** (fadeIn, scaleIn)

#### Características Nuevas

##### 1. Botones de Acción (Aceptar/Rechazar)

**Cuándo se muestran**:
- Solo si el presupuesto está en estado `sent` o `viewed`
- No se muestran si ya fue respondido (`accepted`, `rejected`, etc.)

**Diseño**:
```html
<!-- Botón Rechazar -->
<button class="border-2 border-gray-300 hover:border-gray-400">
  Rechazar
</button>

<!-- Botón Aceptar -->
<button class="bg-gradient-to-r from-blue-600 to-blue-700 
               hover:from-blue-700 hover:to-blue-800
               transform hover:scale-[1.02] active:scale-[0.98]">
  ✓ Aceptar presupuesto
</button>
```

##### 2. Modal de Confirmación

**Características**:
- 🎯 Overlay semi-transparente con blur
- 📝 Mensaje específico según acción (accept/reject)
- 💰 Muestra el total del presupuesto al aceptar
- ⚡ Animaciones de entrada (fadeIn + scaleIn)
- 🖱️ Click fuera para cancelar
- ⌨️ Botones claros: Cancelar / Confirmar

**Flujo de UX**:
1. Usuario hace click en Aceptar/Rechazar
2. Se muestra modal de confirmación
3. Usuario confirma o cancela
4. Si confirma:
   - Se muestra estado "Procesando..."
   - Botones se deshabilitan
   - Se ejecuta la acción
   - Se actualiza el estado del presupuesto
   - Se cierra el modal
   - Se muestra mensaje de éxito

##### 3. Estados Visuales

**Loading State**:
```
┌─────────────────────────────────┐
│  🔄 Cargando presupuesto...     │
│     (spinner animado)           │
└─────────────────────────────────┘
```

**Empty State**:
```
┌─────────────────────────────────┐
│  📄                             │
│  Presupuesto no encontrado      │
│  o sin acceso.                  │
└─────────────────────────────────┘
```

**Success State** (presupuesto cargado):
```
┌─────────────────────────────────────────────┐
│ ← Volver a presupuestos                    │
│ Presupuesto Q-2024-001                     │
│                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │ Título   │ │ Estado   │ │ Fecha    │    │
│ │ ...      │ │ Enviado  │ │ 03/11/24 │    │
│ └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│ Conceptos                                   │
│ ┌─────────────────────────────────────────┐│
│ │ Descripción  Cant.  Precio  IVA  Total ││
│ │ ...                                     ││
│ └─────────────────────────────────────────┘│
│                                             │
│ Total: 1.500,00 €                          │
│                                             │
│             [Rechazar] [✓ Aceptar]         │
└─────────────────────────────────────────────┘
```

---

### 3. Client Portal Service - Nueva Función

**Archivo**: `src/app/services/client-portal.service.ts`

**Método añadido**:
```typescript
async respondToQuote(id: string, action: 'accept' | 'reject'): Promise<{
  data: any | null;
  error?: any;
}>
```

**Implementación**:
- Llama a Edge Function `client-quote-respond`
- Valida respuesta y maneja errores
- Devuelve presupuesto actualizado con items

---

### 4. Edge Function - client-quote-respond

**Archivo**: `supabase/edge-functions/client-quote-respond/index.ts`

#### Seguridad

✅ **Autenticación**: Verifica JWT token del usuario
✅ **Autorización**: Valida mapping en `client_portal_users`
✅ **Ownership**: Comprueba que el presupuesto pertenece al cliente
✅ **Estado**: Solo permite responder a presupuestos `sent` o `viewed`

#### Flujo de Ejecución

```
1. Recibe request con { id, action }
   ↓
2. Valida JWT y obtiene user
   ↓
3. Busca mapping en client_portal_users
   ↓
4. Verifica ownership del presupuesto
   ↓
5. Valida estado del presupuesto
   ↓
6. Actualiza status (accepted/rejected)
   ↓
7. Devuelve presupuesto completo con items
```

#### Respuestas

**Success (200)**:
```json
{
  "success": true,
  "data": {
    "id": "...",
    "full_quote_number": "Q-2024-001",
    "status": "accepted",
    "total_amount": 1500.00,
    "items": [...]
  },
  "message": "Presupuesto aceptado correctamente"
}
```

**Errores posibles**:
- `401`: Missing authorization / Unauthorized
- `400`: Invalid parameters / Wrong status
- `403`: No client portal access
- `404`: Quote not found
- `500`: Internal server error

---

## 🚀 Deployment

### Requisitos Previos

1. **Supabase CLI** instalado:
   ```bash
   npm install -g supabase
   ```

2. **Login en Supabase**:
   ```bash
   supabase login
   ```

### Comando de Deploy

```bash
cd f:\simplifica
supabase functions deploy client-quote-respond --no-verify-jwt
```

O con project reference:
```bash
supabase functions deploy client-quote-respond --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt
```

---

## 🧪 Testing

### 1. Preparación de Datos de Prueba

#### Crear presupuesto de prueba
```sql
-- En Supabase Dashboard > SQL Editor
INSERT INTO quotes (
  company_id,
  client_id,
  full_quote_number,
  title,
  status,
  quote_date,
  valid_until,
  total_amount
) VALUES (
  'tu-company-id',
  'tu-client-id',
  'Q-2024-TEST',
  'Presupuesto de Prueba',
  'sent', -- Estado que permite aceptar/rechazar
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '14 days',
  1500.00
) RETURNING id;
```

#### Crear items del presupuesto
```sql
INSERT INTO quote_items (
  quote_id,
  description,
  quantity,
  unit_price,
  tax_rate,
  total
) VALUES (
  'quote-id-del-paso-anterior',
  'Concepto de prueba',
  1,
  1500.00,
  21,
  1815.00
);
```

#### Crear mapping de cliente
```sql
INSERT INTO client_portal_users (
  company_id,
  client_id,
  email,
  is_active
) VALUES (
  'tu-company-id',
  'tu-client-id',
  'cliente@test.com',
  true
);
```

### 2. Flujo de Prueba Completo

#### A. Test de Email Deep Link

1. **Enviar email** con presupuesto (usar Edge Function `quotes-email`)
2. **Hacer click** en botón "Ver presupuesto" del email
3. **Verificar** que redirecciona a: `/login?returnUrl=/portal/presupuestos/{id}`
4. **Login** con credenciales de cliente
5. **Verificar** que auto-navega al detalle del presupuesto

**Resultado esperado**: ✅ Detalle del presupuesto se abre automáticamente

#### B. Test de Botones Aceptar/Rechazar

1. **Navegar** a `/portal/presupuestos`
2. **Click** en un presupuesto con estado `sent` o `viewed`
3. **Verificar** que se muestran botones Aceptar/Rechazar
4. **Click** en "Aceptar"
5. **Verificar** modal de confirmación se muestra
6. **Click** en "Sí, aceptar"
7. **Verificar**:
   - Estado cambia a "Aceptado" en la UI
   - Botones desaparecen
   - Mensaje "Ya has respondido a este presupuesto" aparece

**Resultado esperado**: ✅ Presupuesto marcado como aceptado en DB

#### C. Test de Presupuesto Ya Respondido

1. **Abrir** presupuesto con status `accepted` o `rejected`
2. **Verificar** que NO se muestran botones
3. **Verificar** mensaje: "Ya has respondido a este presupuesto"

**Resultado esperado**: ✅ Botones ocultos para presupuestos respondidos

#### D. Test de Estado Inválido

1. **Cambiar** status de presupuesto a `draft` en DB
2. **Abrir** presupuesto
3. **Verificar** que NO se muestran botones

**Resultado esperado**: ✅ Solo estados `sent`/`viewed` permiten responder

---

## 📊 Verificación en Supabase Dashboard

### 1. Logs de Edge Function

**Ruta**: Dashboard → Edge Functions → client-quote-respond → Logs

**Logs esperados**:
```
📝 User cliente@test.com attempting to accept quote abc123...
✅ Quote abc123 accepted successfully by cliente@test.com
```

### 2. Verificar Update en DB

**Tabla**: `quotes`

Ejecutar query:
```sql
SELECT id, full_quote_number, status, updated_at
FROM quotes
WHERE id = 'tu-quote-id';
```

**Resultado esperado**:
- `status` = `'accepted'` o `'rejected'`
- `updated_at` actualizado al timestamp actual

---

## 🎨 Guía de Estilos Aplicada

### Colores

- **Primary**: Blue 600-700 (CTA principal)
- **Secondary**: Gray 100-300 (Borders, backgrounds)
- **Success**: Green 100-800 (Estado aceptado)
- **Error**: Red 100-800 (Estado rechazado)
- **Warning**: Orange 100-800 (Estado expirado)

### Tipografía

- **Headings**: `text-2xl sm:text-3xl font-bold`
- **Body**: `text-base`
- **Labels**: `text-xs font-medium uppercase tracking-wider`
- **Numbers**: `font-semibold` o `font-bold`

### Espaciado

- **Cards**: `p-5` o `p-6`
- **Gaps**: `gap-3` o `gap-4`
- **Margins**: `mb-4` o `mb-6`

### Efectos

- **Shadows**: `shadow-sm` → `hover:shadow-md` → `hover:shadow-lg`
- **Transitions**: `transition-all` o `transition-colors`
- **Transforms**: `hover:scale-[1.02]` + `active:scale-[0.98]`
- **Borders**: `border border-gray-200` → `hover:border-gray-400`

### Responsive

- **Mobile First**: Base styles para mobile
- **Breakpoints**:
  - `sm:` → 640px (tablet)
  - `md:` → 768px (desktop pequeño)
  - `lg:` → 1024px (desktop grande)

---

## 📁 Archivos Modificados/Creados

### Modificados

1. ✅ `src/app/components/login/login.component.ts`
   - Mejorada navegación con returnUrl
   - Mejor logging y manejo de errores

2. ✅ `src/app/components/portal-quote-detail/portal-quote-detail.component.ts`
   - UI completamente renovada
   - Añadidos botones Accept/Reject
   - Modal de confirmación
   - Estados de procesamiento

3. ✅ `src/app/services/client-portal.service.ts`
   - Añadido método `respondToQuote()`

### Creados

1. ✅ `supabase/edge-functions/client-quote-respond/index.ts`
   - Edge Function para aceptar/rechazar presupuestos

2. ✅ `supabase/functions/client-quote-respond/index.ts`
   - Copia para deployment con Supabase CLI

3. ✅ `CLIENT_QUOTE_RESPOND_DEPLOYMENT.md`
   - Guía de deployment de la Edge Function

4. ✅ `PORTAL_PRESUPUESTOS_MEJORAS.md` (este archivo)
   - Documentación completa de todas las mejoras

---

## ✅ Checklist de Validación

### Pre-Deployment

- [ ] Código sin errores TypeScript/ESLint
- [ ] Build de Angular exitoso
- [ ] Edge Function testeada localmente (opcional)

### Deployment

- [ ] Edge Function `client-quote-respond` desplegada
- [ ] Verificar logs en Supabase Dashboard
- [ ] Probar endpoint manualmente con curl/Postman

### Testing Funcional

- [ ] Email deep link navega correctamente
- [ ] Login con returnUrl funciona
- [ ] Detalle de presupuesto se muestra correctamente
- [ ] Botones Aceptar/Rechazar aparecen en estado correcto
- [ ] Modal de confirmación funciona
- [ ] Aceptar presupuesto actualiza estado
- [ ] Rechazar presupuesto actualiza estado
- [ ] Presupuestos respondidos ocultan botones
- [ ] UI responsive en mobile/tablet/desktop

### Testing de Seguridad

- [ ] Usuario sin mapping no puede ver presupuestos
- [ ] Usuario no puede aceptar presupuestos de otros clientes
- [ ] Solo estados `sent`/`viewed` permiten respuestas
- [ ] Tokens JWT se validan correctamente

---

## 🐛 Troubleshooting

### Problema: "No client portal access found for user"

**Causa**: No existe mapping en `client_portal_users` o `is_active = false`

**Solución**:
```sql
SELECT * FROM client_portal_users 
WHERE email = 'email-del-cliente';

-- Si no existe, crear:
INSERT INTO client_portal_users (company_id, client_id, email, is_active)
VALUES ('company-id', 'client-id', 'email', true);
```

### Problema: "Quote not found or access denied"

**Causa**: Presupuesto no pertenece al cliente autenticado

**Solución**:
```sql
SELECT q.id, q.client_id, cpu.client_id as mapped_client_id
FROM quotes q
LEFT JOIN client_portal_users cpu 
  ON cpu.email = 'email-cliente' 
  AND cpu.company_id = q.company_id
WHERE q.id = 'quote-id';

-- Verificar que q.client_id = cpu.client_id
```

### Problema: Botones no aparecen

**Causa**: Estado del presupuesto no es `sent` o `viewed`

**Solución**:
```sql
UPDATE quotes 
SET status = 'sent' 
WHERE id = 'quote-id';
```

### Problema: Error 401 al llamar Edge Function

**Causa**: JWT token no se está enviando o es inválido

**Solución**:
- Verificar que el usuario está autenticado
- Comprobar que el token no ha expirado
- Revisar headers en DevTools > Network

---

## 🎯 Próximos Pasos Recomendados

1. **Notificaciones**:
   - Enviar email a la empresa cuando cliente acepta/rechaza presupuesto
   - Webhook o Edge Function trigger

2. **Historial**:
   - Tabla `quote_responses` con timestamp de aceptación/rechazo
   - Auditoría de cambios de estado

3. **Analytics**:
   - Tasa de aceptación de presupuestos
   - Tiempo medio de respuesta
   - Presupuestos más vistos

4. **Conversión a Factura**:
   - Botón automático en presupuestos aceptados
   - Generar factura desde presupuesto

5. **Comentarios**:
   - Permitir al cliente dejar comentarios al rechazar
   - Chat integrado en el presupuesto

---

## 📞 Soporte

Para cualquier problema:

1. **Revisar logs** en Supabase Dashboard
2. **Consultar console** del navegador (F12)
3. **Verificar RLS policies** en tabla `quotes`
4. **Comprobar Edge Function** está desplegada

---

**Fecha de última actualización**: 3 de Noviembre 2024  
**Versión**: 1.0  
**Estado**: ✅ Listo para deployment
