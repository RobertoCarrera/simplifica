# 🔒 Client Portal Security Guide

## Phase 9: Guards & Security - COMPLETADO

### ✅ Implementación de Políticas RLS

Se han creado políticas RLS (Row Level Security) específicas para el portal de clientes que garantizan:

1. **Aislamiento de datos**: Los clientes solo pueden ver sus propios datos
2. **Autenticación requerida**: Todas las políticas requieren `TO authenticated`
3. **Validación de cliente activo**: Se verifica `is_active = true`
4. **Filtrado por auth_user_id**: Se utiliza `auth.uid()` para identificar al cliente

### 📋 Políticas Implementadas

#### 1. Tickets
- ✅ `clients_can_view_own_tickets`: Clientes pueden ver solo sus tickets
- Filtro: `tickets.client_id = clients.id WHERE clients.auth_user_id = auth.uid()`

#### 2. Presupuestos (Quotes)
- ✅ `clients_can_view_own_quotes`: Clientes pueden ver sus presupuestos
- ✅ `clients_can_update_own_quotes_status`: Clientes pueden aceptar/rechazar presupuestos
- Filtro: `quotes.client_id = clients.id WHERE clients.auth_user_id = auth.uid()`

#### 3. Quote Items
- ✅ `clients_can_view_own_quote_items`: Clientes pueden ver items de sus presupuestos
- Filtro: A través de la relación con quotes

#### 4. Facturas (Invoices)
- ✅ `clients_can_view_own_invoices`: Clientes pueden ver sus facturas
- Filtro: `invoices.client_id = clients.id WHERE clients.auth_user_id = auth.uid()`

#### 5. Invoice Items
- ✅ `clients_can_view_own_invoice_items`: Clientes pueden ver items de sus facturas
- Filtro: A través de la relación con invoices

#### 6. Ticket Stages
- ✅ `clients_can_view_ticket_stages`: Clientes pueden ver etapas (solo lectura)
- Filtro: Por company_id del cliente

#### 7. Ticket Comments
- ✅ `clients_can_view_own_ticket_comments`: Clientes pueden ver comentarios de sus tickets
- Filtro: A través de la relación con tickets

### 🛡️ Guards Implementados

#### ClientRoleGuard
- **Ubicación**: `src/app/guards/client-role.guard.ts`
- **Propósito**: Protege rutas del portal, permite solo rol 'client'
- **Uso**: `canActivate: [ClientRoleGuard]` en rutas del portal

#### ModuleGuard
- **Ubicación**: `src/app/guards/module.guard.ts`
- **Propósito**: Verifica que el cliente tenga acceso a módulos específicos
- **Uso**: `canActivate: [ModuleGuard]` con `data: { module: 'moduloPresupuestos' }`

#### Ejemplo de ruta protegida:
```typescript
{
  path: 'portal',
  component: ClientPortalLayoutComponent,
  canActivate: [ClientRoleGuard],
  children: [
    {
      path: 'presupuestos',
      component: PortalQuotesComponent,
      canActivate: [ModuleGuard],
      data: { module: 'moduloPresupuestos' }
    }
  ]
}
```

### 🔍 Verificación de Seguridad

#### Scripts SQL creados:

1. **rls-client-portal-policies.sql**
   - Crea todas las políticas RLS para clientes
   - Agrega comentarios descriptivos
   - Verifica que las políticas se crearon correctamente

2. **verify-client-portal-security.sql**
   - Verifica que RLS está habilitado
   - Lista todas las políticas de clientes
   - Verifica aislamiento de datos
   - Detecta posibles problemas de seguridad
   - Genera un resumen de checklist

#### Cómo ejecutar la verificación:

```bash
# 1. Aplicar políticas RLS (si no están aplicadas)
psql -h db.ufutyjbqfjrlzkprvyvs.supabase.co \
     -U postgres \
     -d postgres \
     -f rls-client-portal-policies.sql

# 2. Verificar que todo funciona
psql -h db.ufutyjbqfjrlzkprvyvs.supabase.co \
     -U postgres \
     -d postgres \
     -f verify-client-portal-security.sql
```

### ✅ Testing Manual

#### Test 1: Verificar aislamiento de datos
1. Autenticarse como cliente portal (ej: puchu_114@hotmail.com)
2. Navegar a /portal/tickets
3. Verificar que solo se muestran tickets del cliente autenticado
4. Intentar acceder a un ticket de otro cliente (debería fallar)

#### Test 2: Verificar guards
1. Sin autenticación, intentar acceder a /portal (debería redirigir a login)
2. Autenticarse como staff, intentar acceder a /portal (debería redirigir a dashboard)
3. Autenticarse como cliente, acceder a /portal (debería funcionar)

#### Test 3: Verificar módulos
1. Desactivar `moduloPresupuestos` en configuración del cliente
2. Intentar acceder a /portal/presupuestos (debería redirigir a /portal/inicio)
3. Verificar que el menú no muestra la opción "Presupuestos"

#### Test 4: Verificar permisos de actualización
1. Como cliente, aceptar un presupuesto desde /portal/presupuestos
2. Verificar que el estado cambia a 'accepted'
3. Intentar modificar otros campos (ej: amount) - debería fallar

### 🚨 Advertencias de Seguridad

#### ⚠️ Service Role Key
Las Edge Functions utilizan `service_role` key que **bypasses RLS**.
Por eso es crítico que:
- Validen el `auth.uid()` antes de realizar operaciones
- Filtren datos por `client_id` basándose en el usuario autenticado
- No expongan datos sensibles en respuestas

#### ⚠️ Edge Functions Validadas
✅ `get-config-units`: Filtra por company_id del usuario
✅ `hide-unit`: Valida usuario antes de modificar
✅ `hide-stage`: Valida usuario antes de modificar

#### ⚠️ Cliente sin auth_user_id
Si un cliente no tiene `auth_user_id`, **NO puede acceder al portal**.
Para habilitar acceso:
```sql
UPDATE clients 
SET auth_user_id = '<uuid-from-auth-users>'
WHERE id = '<client-id>';
```

### 📊 Resumen de Seguridad

| Aspecto | Estado | Notas |
|---------|--------|-------|
| RLS Habilitado | ✅ | Todas las tablas críticas |
| Políticas SELECT | ✅ | tickets, quotes, invoices, clients |
| Políticas UPDATE | ✅ | quotes (solo status) |
| Guards en rutas | ✅ | ClientRoleGuard, ModuleGuard |
| Validación de módulos | ✅ | ModuleGuard + client settings |
| Edge Functions | ✅ | Validan usuario y filtran por client_id |
| Aislamiento de datos | ✅ | Cada cliente ve solo sus datos |
| Prevención XSS | ✅ | Angular sanitiza automáticamente |
| Prevención CSRF | ✅ | Supabase maneja tokens |

### 🎯 Phase 9 Completado

✅ Políticas RLS creadas para todas las tablas del portal  
✅ Guards implementados y protegiendo rutas  
✅ Edge Functions validadas y securizadas  
✅ Scripts de verificación creados  
✅ Documentación de seguridad completada  

**Siguiente paso**: Phase 10 - Testing & Polish

---

## Phase 10: Testing & Polish

### 📝 Testing Checklist

#### 1. Testing Funcional

- [ ] **Inicio (Dashboard)**
  - [ ] Contadores muestran datos correctos (mis tickets, mis presupuestos, etc.)
  - [ ] Solo muestra datos del cliente autenticado
  - [ ] Módulos deshabilitados no se muestran

- [ ] **Tickets**
  - [ ] Lista muestra solo tickets del cliente
  - [ ] Búsqueda y filtros funcionan
  - [ ] Detalles del ticket se cargan correctamente
  - [ ] No se pueden ver tickets de otros clientes

- [ ] **Presupuestos**
  - [ ] Lista muestra solo presupuestos del cliente
  - [ ] Puede aceptar/rechazar presupuestos
  - [ ] Vista detallada funciona correctamente
  - [ ] PDF se descarga correctamente

- [ ] **Facturación**
  - [ ] Lista muestra solo facturas del cliente
  - [ ] Filtros funcionan (por fecha, estado, etc.)
  - [ ] Vista detallada carga correctamente
  - [ ] PDF se descarga correctamente

- [ ] **Servicios Contratados**
  - [ ] Muestra servicios recurrentes del cliente
  - [ ] Descripción de recurrencia correcta
  - [ ] Botón cancelar funciona
  - [ ] Solo muestra servicios activos/aceptados

- [ ] **Chat (Anychat)**
  - [ ] Chat se carga correctamente
  - [ ] Puede enviar mensajes
  - [ ] Recibe respuestas
  - [ ] Historia de conversaciones persiste

- [ ] **Configuración**
  - [ ] Muestra configuración limitada del cliente
  - [ ] Puede ocultar unidades de servicio
  - [ ] Cambios persisten correctamente

#### 2. Testing de Seguridad

- [ ] **Autenticación**
  - [ ] Sin login, redirige a /auth/login
  - [ ] Staff no puede acceder a /portal
  - [ ] Cliente no puede acceder a /dashboard

- [ ] **Autorización**
  - [ ] RLS impide ver datos de otros clientes
  - [ ] Guards bloquean rutas sin permisos
  - [ ] Edge Functions validan usuario

- [ ] **Módulos**
  - [ ] Módulos deshabilitados no son accesibles
  - [ ] Menú no muestra opciones de módulos deshabilitados
  - [ ] Redirige correctamente si intenta acceder

#### 3. Testing de UI/UX

- [ ] **Responsive Design**
  - [ ] Funciona en desktop (1920x1080)
  - [ ] Funciona en tablet (768x1024)
  - [ ] Funciona en móvil (375x667)
  - [ ] Sidebar colapsable funciona correctamente

- [ ] **Dark Mode**
  - [ ] Todos los componentes respetan dark mode
  - [ ] Sin colores hardcoded que rompan el tema
  - [ ] Toggle de dark mode funciona

- [ ] **Navegación**
  - [ ] Breadcrumbs correctos
  - [ ] Links del menú activos destacados
  - [ ] Botón volver funciona donde corresponde

- [ ] **Feedback Visual**
  - [ ] Loaders mientras cargan datos
  - [ ] Mensajes de éxito/error claros
  - [ ] Estados vacíos bien diseñados

#### 4. Testing de Performance

- [ ] **Tiempos de Carga**
  - [ ] Dashboard carga en < 2s
  - [ ] Listas paginan correctamente
  - [ ] No hay memory leaks

- [ ] **Optimizaciones**
  - [ ] Imágenes optimizadas
  - [ ] Lazy loading de rutas
  - [ ] OnPush change detection donde aplique

#### 5. Testing Cross-Browser

- [ ] Chrome/Edge (último)
- [ ] Firefox (último)
- [ ] Safari (último)
- [ ] Mobile Chrome
- [ ] Mobile Safari

### 🐛 Bugs Conocidos a Resolver

1. **Icons fallback**: Si lucide-angular no carga, usar fallback a Material Icons
2. **Paginación**: Implementar paginación en todas las listas largas
3. **Búsqueda**: Debounce en campos de búsqueda para reducir queries
4. **Errores de red**: Manejar mejor errores de conexión (retry, offline mode)

### 🎨 Polish Pendiente

1. **Animaciones**: Agregar transiciones suaves entre vistas
2. **Skeleton Loaders**: Implementar en lugar de spinners genéricos
3. **Toasts**: Unificar sistema de notificaciones (usar toast-service.ts)
4. **Empty States**: Mejorar mensajes cuando no hay datos
5. **Help Tooltips**: Agregar tooltips explicativos en configuración

### 📱 Mejoras Móviles

1. **Bottom Navigation**: Considerar bottom nav en móvil en lugar de sidebar
2. **Gestos**: Swipe para abrir/cerrar menú
3. **Touch Targets**: Asegurar mínimo 44x44px para botones
4. **Teclado Virtual**: UI se adapta cuando teclado está abierto

### ♿ Accesibilidad

- [ ] ARIA labels en todos los componentes interactivos
- [ ] Navegación por teclado funciona
- [ ] Contraste de colores cumple WCAG 2.1 AA
- [ ] Screen readers funcionan correctamente

### 📚 Documentación Pendiente

1. **USER_GUIDE.md**: Guía de usuario del portal
2. **ADMIN_GUIDE.md**: Cómo configurar acceso de clientes
3. **TROUBLESHOOTING.md**: Problemas comunes y soluciones

### 🚀 Deployment Checklist

- [ ] Variables de entorno configuradas en producción
- [ ] Edge Functions deployadas
- [ ] Políticas RLS aplicadas en producción
- [ ] Datos de prueba removidos
- [ ] Analytics configurado (si aplica)
- [ ] Error tracking (Sentry?) configurado
- [ ] Backups automáticos configurados

### ✅ Criterios de Aceptación Final

El portal estará listo cuando:
1. ✅ Todos los tests funcionales pasen
2. ✅ No hay errores de consola
3. ✅ Funciona en móvil y desktop
4. ✅ Performance aceptable (< 2s carga inicial)
5. ✅ Seguridad validada (RLS + Guards funcionando)
6. ✅ UX es intuitiva (feedback del cliente real)

---

## 📞 Contacto y Soporte

Para problemas de seguridad o bugs críticos:
- Revisar logs de Supabase
- Verificar políticas RLS con `verify-client-portal-security.sql`
- Consultar esta documentación

**Última actualización**: 2024 - Phase 9 & 10 Implementation
