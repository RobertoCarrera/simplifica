# 🧪 Guía de Testing - Portal de Clientes

## 📋 Resumen

Este documento proporciona instrucciones detalladas para testear el portal de clientes después de implementar las políticas RLS y los cambios de seguridad.

---

## 🚀 Pre-requisitos

### 1. Base de Datos

Antes de comenzar el testing, asegúrate de haber ejecutado:

```bash
# Aplicar políticas RLS
./deploy-client-portal-rls.sh

# O manualmente:
psql -h db.ufutyjbqfjrlzkprvyvs.supabase.co \
     -U postgres \
     -d postgres \
     -f rls-client-portal-policies.sql
```

### 2. Edge Functions

Verifica que las Edge Functions estén deployadas:

```bash
cd supabase/functions
supabase functions deploy get-config-units
supabase functions deploy hide-unit
supabase functions deploy hide-stage
```

### 3. Aplicación Angular

Asegúrate de que no hay errores de compilación:

```bash
npm run build
# O para desarrollo:
npm start
```

---

## 👤 Usuario de Prueba

**Cliente Portal**:
- Email: `puchu_114@hotmail.com`
- Nombre: Gemma Socias Lahoz
- Auth User ID: `0e4662bc-0696-4e4f-a489-d9ce811c9745`
- Company ID: `cd830f43-f6f0-4b78-a2a4-505e4e0976b5`
- Tabla: `clients` (no `users`)

**Credenciales**: (Las que estén configuradas en Supabase Auth)

---

## ✅ Testing Funcional

### Test 1: Autenticación y Acceso

#### 1.1 Login como Cliente
```
[ ] Navegar a http://localhost:4200/auth/login
[ ] Ingresar credenciales del cliente
[ ] Verificar que redirige a /portal/inicio
[ ] NO debe aparecer ningún error en consola
```

**Resultado esperado**: ✅ Login exitoso, redirige a portal

#### 1.2 Acceso Directo sin Login
```
[ ] Abrir navegador en incógnito
[ ] Navegar a http://localhost:4200/portal
[ ] Verificar que redirige a /auth/login
```

**Resultado esperado**: ✅ Redirige a login

#### 1.3 Staff no puede acceder a Portal
```
[ ] Login como usuario staff (role != 'client')
[ ] Intentar acceder a /portal
[ ] Verificar que redirige a /dashboard
```

**Resultado esperado**: ✅ Staff redirigido a dashboard

---

### Test 2: Dashboard (Inicio)

#### 2.1 Contadores de Dashboard
```
[ ] Login como cliente
[ ] Navegar a /portal/inicio
[ ] Verificar que se muestran contadores:
    [ ] Tickets Abiertos
    [ ] Presupuestos Pendientes
    [ ] Facturas Pendientes
    [ ] Servicios Activos
[ ] Los números deben ser >= 0
```

**Verificación en DB**:
```sql
-- Tickets del cliente
SELECT COUNT(*) FROM tickets 
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745'
);

-- Presupuestos pendientes
SELECT COUNT(*) FROM quotes 
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745'
)
AND status = 'pending';
```

**Resultado esperado**: ✅ Contadores coinciden con queries de DB

#### 2.2 Módulos Visibles
```
[ ] Verificar que solo se muestran módulos habilitados
[ ] Si moduloPresupuestos = false, no debe aparecer en menú
[ ] Si moduloFacturas = false, no debe aparecer en menú
```

**Resultado esperado**: ✅ Módulos filtrados correctamente

---

### Test 3: Tickets

#### 3.1 Lista de Tickets
```
[ ] Navegar a /portal/tickets
[ ] Verificar que se carga la lista
[ ] NO debe aparecer error 406
[ ] NO debe aparecer error en consola
```

**Resultado esperado**: ✅ Lista carga sin errores

#### 3.2 Aislamiento de Datos
```
[ ] Verificar que solo se muestran tickets del cliente autenticado
[ ] Anotar IDs de tickets visibles
[ ] Verificar en DB que todos tienen client_id correcto:
```

```sql
SELECT id, title, client_id 
FROM tickets 
WHERE id IN (<lista-de-ids-visibles>);

-- Todos deben tener client_id = <id-del-cliente>
```

**Resultado esperado**: ✅ Solo tickets del cliente autenticado

#### 3.3 Búsqueda y Filtros
```
[ ] Buscar por palabra clave
[ ] Filtrar por estado
[ ] Verificar que resultados son correctos
```

**Resultado esperado**: ✅ Búsqueda y filtros funcionan

#### 3.4 Vista Detallada
```
[ ] Click en un ticket
[ ] Verificar que se abre modal/vista detallada
[ ] Verificar que muestra información completa
```

**Resultado esperado**: ✅ Detalles se muestran correctamente

---

### Test 4: Presupuestos

#### 4.1 Lista de Presupuestos
```
[ ] Navegar a /portal/presupuestos
[ ] Verificar que se carga la lista
[ ] Verificar que solo muestra presupuestos del cliente
```

**Verificación en DB**:
```sql
SELECT id, quote_number, client_id, status
FROM quotes
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745'
);
```

**Resultado esperado**: ✅ Solo presupuestos del cliente

#### 4.2 Aceptar Presupuesto
```
[ ] Seleccionar un presupuesto con status = 'pending'
[ ] Click en botón "Aceptar"
[ ] Verificar que cambia a status = 'accepted'
[ ] Verificar en DB que el cambio persistió
```

**Resultado esperado**: ✅ Presupuesto aceptado correctamente

#### 4.3 Rechazar Presupuesto
```
[ ] Seleccionar un presupuesto con status = 'pending'
[ ] Click en botón "Rechazar"
[ ] Verificar que cambia a status = 'rejected'
[ ] Verificar en DB que el cambio persistió
```

**Resultado esperado**: ✅ Presupuesto rechazado correctamente

#### 4.4 Descargar PDF
```
[ ] Click en botón "Descargar PDF"
[ ] Verificar que se descarga el archivo
[ ] Abrir PDF y verificar que muestra datos correctos
```

**Resultado esperado**: ✅ PDF se descarga y muestra datos correctos

---

### Test 5: Facturación

#### 5.1 Lista de Facturas
```
[ ] Navegar a /portal/facturacion
[ ] Verificar que se carga la lista
[ ] Verificar que solo muestra facturas del cliente
```

**Verificación en DB**:
```sql
SELECT id, invoice_number, client_id, status
FROM invoices
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745'
);
```

**Resultado esperado**: ✅ Solo facturas del cliente

#### 5.2 Filtros de Fecha
```
[ ] Filtrar por rango de fechas
[ ] Verificar que resultados están en el rango
```

**Resultado esperado**: ✅ Filtros funcionan correctamente

#### 5.3 Descargar PDF
```
[ ] Click en botón "Descargar PDF" de una factura
[ ] Verificar que se descarga correctamente
[ ] Abrir PDF y verificar datos
```

**Resultado esperado**: ✅ PDF se descarga correctamente

---

### Test 6: Servicios Contratados

#### 6.1 Lista de Servicios
```
[ ] Navegar a /portal/servicios
[ ] Verificar que se carga la lista
[ ] NO debe aparecer error
[ ] Verificar que muestra servicios recurrentes
```

**Verificación en DB**:
```sql
SELECT id, quote_number, recurrence_type, recurrence_interval, status
FROM quotes
WHERE client_id = (
  SELECT id FROM clients 
  WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745'
)
AND recurrence_type IS NOT NULL
AND status IN ('accepted', 'active', 'paused');
```

**Resultado esperado**: ✅ Servicios recurrentes se muestran

#### 6.2 Descripción de Recurrencia
```
[ ] Verificar que muestra texto descriptivo:
    [ ] "Se repite mensualmente" para monthly
    [ ] "Se repite anualmente" para yearly
    [ ] etc.
```

**Resultado esperado**: ✅ Descripciones correctas

#### 6.3 Cancelar Servicio
```
[ ] Click en botón "Cancelar Servicio"
[ ] Confirmar cancelación
[ ] Verificar que status cambia a 'paused'
[ ] Verificar en DB:
```

```sql
SELECT id, status FROM quotes WHERE id = <id-del-servicio>;
-- Debe ser 'paused'
```

**Resultado esperado**: ✅ Servicio pausado correctamente

---

### Test 7: Chat (Anychat)

#### 7.1 Abrir Chat
```
[ ] Navegar a /portal/chat
[ ] Verificar que se carga el componente Anychat
[ ] NO debe aparecer error
```

**Resultado esperado**: ✅ Chat se carga correctamente

#### 7.2 Enviar Mensaje
```
[ ] Escribir un mensaje
[ ] Enviar
[ ] Verificar que se envía correctamente
```

**Resultado esperado**: ✅ Mensaje se envía

---

### Test 8: Configuración

#### 8.1 Cargar Configuración
```
[ ] Navegar a /portal/configuracion
[ ] Verificar que se carga la vista
[ ] NO debe aparecer error 400
[ ] NO debe aparecer error en consola
```

**Resultado esperado**: ✅ Configuración carga sin errores

#### 8.2 Ocultar Unidad de Servicio
```
[ ] Click en toggle para ocultar una unidad
[ ] Verificar que se actualiza correctamente
[ ] Recargar página
[ ] Verificar que el cambio persistió
```

**Resultado esperado**: ✅ Configuración persiste

---

## 🔒 Testing de Seguridad

### Test 9: Aislamiento de Datos

#### 9.1 Cliente NO puede ver datos de otros clientes

**Setup**: Necesitas al menos 2 clientes diferentes en la DB.

```sql
-- Verificar que existen múltiples clientes
SELECT id, name, email, auth_user_id 
FROM clients 
WHERE auth_user_id IS NOT NULL;
```

**Test**:
```
[ ] Login como Cliente A
[ ] Navegar a /portal/tickets
[ ] Anotar IDs de tickets visibles
[ ] Logout
[ ] Login como Cliente B
[ ] Navegar a /portal/tickets
[ ] Anotar IDs de tickets visibles
[ ] Verificar que los IDs son diferentes
[ ] Ningún ticket debe aparecer en ambas listas
```

**Resultado esperado**: ✅ Cada cliente ve solo sus tickets

#### 9.2 Intentar acceder a recurso de otro cliente

**Test manual (con DevTools)**:
```
[ ] Login como Cliente A
[ ] Abrir DevTools → Network
[ ] Intentar hacer query directa de ticket de Cliente B:
```

```javascript
// En consola del navegador:
const { data, error } = await supabase
  .from('tickets')
  .select('*')
  .eq('id', '<id-de-ticket-de-otro-cliente>')
  .single();

console.log(data, error);
```

**Resultado esperado**: ✅ Error o data = null (RLS bloquea acceso)

---

### Test 10: Guards

#### 10.1 ClientRoleGuard
```
[ ] Sin login, intentar acceder a /portal
    → Debe redirigir a /auth/login
    
[ ] Login como staff (role != 'client')
    → Intentar acceder a /portal
    → Debe redirigir a /dashboard
    
[ ] Login como cliente (role = 'client')
    → Acceder a /portal
    → Debe permitir acceso
```

**Resultado esperado**: ✅ Guard funciona correctamente

#### 10.2 ModuleGuard
```
[ ] Desactivar moduloPresupuestos en configuración:
```

```sql
UPDATE clients 
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb), 
  '{moduloPresupuestos}', 
  'false'
)
WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745';
```

```
[ ] Intentar acceder a /portal/presupuestos
    → Debe redirigir a /portal/inicio
    
[ ] Verificar que menú no muestra "Presupuestos"
```

**Resultado esperado**: ✅ ModuleGuard bloquea acceso

---

## 📱 Testing Responsive

### Test 11: Mobile

#### 11.1 iPhone SE (375x667)
```
[ ] Abrir DevTools
[ ] Cambiar a iPhone SE
[ ] Login y navegar por todas las secciones
[ ] Verificar que:
    [ ] Sidebar es colapsable
    [ ] Tablas son scrollables
    [ ] Botones son clickeables (44x44px mínimo)
    [ ] No hay overflow horizontal
```

**Resultado esperado**: ✅ Funciona en mobile

#### 11.2 Tablet (768x1024)
```
[ ] Cambiar a iPad
[ ] Navegar por todas las secciones
[ ] Verificar layout correcto
```

**Resultado esperado**: ✅ Funciona en tablet

---

## 🌐 Testing Cross-Browser

### Test 12: Navegadores

```
[ ] Chrome/Edge (último)
    [ ] Login funciona
    [ ] Todas las secciones funcionan
    
[ ] Firefox (último)
    [ ] Login funciona
    [ ] Todas las secciones funcionan
    
[ ] Safari (último)
    [ ] Login funciona
    [ ] Todas las secciones funcionan
```

**Resultado esperado**: ✅ Funciona en todos los navegadores principales

---

## 🐛 Registro de Bugs

### Formato de Reporte

**Bug #**: [Número]  
**Fecha**: [Fecha]  
**Severidad**: [Critical / High / Medium / Low]  
**Módulo**: [Tickets / Presupuestos / etc.]  
**Descripción**: [Descripción detallada]  
**Pasos para reproducir**:
1. [Paso 1]
2. [Paso 2]
3. [Paso 3]

**Resultado esperado**: [Qué debería pasar]  
**Resultado actual**: [Qué pasa realmente]  
**Screenshots**: [Si aplica]  
**Logs de consola**: [Errores relevantes]

---

## ✅ Checklist Final

```
[ ] Todos los tests funcionales pasan
[ ] Todos los tests de seguridad pasan
[ ] No hay errores en consola
[ ] Performance es aceptable (< 2s carga inicial)
[ ] Funciona en mobile y desktop
[ ] Funciona en los 3 navegadores principales
[ ] RLS policies verificadas con verify-client-portal-security.sql
[ ] Documentación actualizada
```

---

## 📝 Notas Adicionales

### Comandos Útiles

**Ver logs de Supabase**:
```bash
supabase logs --all
```

**Verificar Edge Functions**:
```bash
supabase functions list
```

**Reset DB (CUIDADO - Solo en desarrollo)**:
```bash
supabase db reset
```

### Contactos

- **Documentación**: `CLIENT_PORTAL_SECURITY_GUIDE.md`
- **Políticas RLS**: `rls-client-portal-policies.sql`
- **Verificación**: `verify-client-portal-security.sql`

---

**Última actualización**: 2024  
**Estado**: Listo para testing
