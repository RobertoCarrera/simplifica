# 🚀 Guía de Integración Frontend GDPR

## ✅ Archivos Creados

### 1. Servicio GDPR (`src/app/core/services/gdpr.service.ts`)
**Funciones disponibles:**
- `exportClientData(clientId)` - Exporta datos del cliente (Art. 15/20)
- `downloadClientData(clientId, clientName)` - Descarga JSON automáticamente
- `anonymizeClient(clientId, reason)` - Anonimiza cliente (Art. 17)
- `createAccessRequest(email, type, details)` - Crea solicitud GDPR
- `processDeletionRequest(requestId, approve, reason)` - Procesa eliminación
- `getConsentStatus(clientId)` - Obtiene estado de consentimientos
- `updateConsent(clientId, type, given, method, purpose)` - Actualiza consentimiento
- `markClientAccessed(clientId)` - Registra acceso en audit log
- `logAuditEvent(action, table, id, purpose)` - Log manual de auditoría

### 2. Componente Panel GDPR (`src/app/features/clients/components/client-gdpr-panel.component.ts`)
**Características:**
- ✅ Visualización de consentimientos (marketing y data processing)
- ✅ Actualización de consentimientos en tiempo real
- ✅ Información de retención de datos
- ✅ Estadísticas de acceso
- ✅ Botones para ejercer derechos GDPR
- ✅ Contacto con DPO
- ✅ Standalone component (no requiere módulo)

### 3. Configuración de Entorno (`src/environments/environment.ts`)
**Variables GDPR añadidas:**
```typescript
gdpr: {
  enabled: true,
  dpoEmail: 'dpo@digitalizamostupyme.com',
  retentionYears: 7,
  autoDeleteAfterDays: 2555,
  breachNotificationHours: 72,
  requestDeadlineDays: 30
}
```

---

## 📝 Cómo Integrar en tu Aplicación

### Paso 1: Agregar el Panel GDPR a la Vista de Cliente

**Opción A: En el componente de detalle del cliente**

```typescript
// client-detail.component.ts
import { Component, OnInit } from '@angular/core';
import { ClientGdprPanelComponent } from './components/client-gdpr-panel.component';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [
    // ... otros imports
    ClientGdprPanelComponent
  ],
  template: `
    <div class="client-detail">
      
      <!-- Información del cliente existente -->
      <div class="client-info">
        <!-- ... tu código existente ... -->
      </div>

      <!-- NUEVO: Panel GDPR -->
      <app-client-gdpr-panel
        [clientId]="client.id"
        [clientEmail]="client.email"
        [clientName]="client.name">
      </app-client-gdpr-panel>

    </div>
  `
})
export class ClientDetailComponent implements OnInit {
  client: any; // Tu interfaz de cliente
  
  // ... resto del código
}
```

**Opción B: Como pestaña en un tabs component**

```typescript
// client-tabs.component.ts
template: `
  <mat-tab-group>
    <mat-tab label="Información">
      <!-- Datos del cliente -->
    </mat-tab>
    
    <mat-tab label="Servicios">
      <!-- Servicios -->
    </mat-tab>
    
    <mat-tab label="GDPR">
      <app-client-gdpr-panel
        [clientId]="clientId"
        [clientEmail]="clientEmail"
        [clientName]="clientName">
      </app-client-gdpr-panel>
    </mat-tab>
  </mat-tab-group>
`
```

---

### Paso 2: Registrar Acceso a Datos del Cliente

**Importante**: Cada vez que visualices los datos de un cliente, debes registrarlo en el audit log.

```typescript
// client-detail.component.ts
import { GDPRService } from '../../core/services/gdpr.service';

export class ClientDetailComponent implements OnInit {
  constructor(
    private gdprService: GDPRService
  ) {}

  ngOnInit(): void {
    this.loadClientData();
    
    // ⚠️ IMPORTANTE: Registrar que se accedió a los datos
    this.gdprService.markClientAccessed(this.clientId).subscribe();
  }

  loadClientData(): void {
    // Tu código para cargar datos del cliente
  }
}
```

---

### Paso 3: Usar las Funciones GDPR en Otros Componentes

**Ejemplo 1: Exportar datos desde un botón**

```typescript
// client-actions.component.ts
import { GDPRService } from '../../core/services/gdpr.service';

export class ClientActionsComponent {
  constructor(private gdprService: GDPRService) {}

  onExportData(client: any): void {
    this.gdprService.downloadClientData(client.id, client.name)
      .subscribe({
        next: (success) => {
          if (success) {
            alert('Datos exportados correctamente');
          }
        },
        error: (err) => console.error('Error:', err)
      });
  }
}
```

**Ejemplo 2: Actualizar consentimiento desde formulario**

```typescript
// client-form.component.ts
updateMarketingConsent(clientId: string, consent: boolean): void {
  this.gdprService.updateConsent(
    clientId,
    'marketing',
    consent,
    'explicit',
    'Actualización desde formulario de cliente'
  ).subscribe({
    next: (response) => {
      if (response.success) {
        console.log('Consentimiento actualizado');
      }
    }
  });
}
```

**Ejemplo 3: Crear solicitud de acceso GDPR**

```typescript
// gdpr-requests.component.ts
createAccessRequest(clientEmail: string): void {
  this.gdprService.createAccessRequest(
    clientEmail,
    'access', // Tipo: access, rectification, erasure, portability, restriction, objection
    'El cliente solicita copia de todos sus datos personales'
  ).subscribe({
    next: (response) => {
      if (response.success) {
        console.log('Solicitud creada:', response.request_id);
        console.log('Fecha límite:', response.deadline_date); // 30 días
      }
    }
  });
}
```

---

## 🎨 Personalización del Componente

### Cambiar Colores

Edita el template del componente `client-gdpr-panel.component.ts`:

```typescript
// Cambiar color del header
<div class="flex items-center gap-3">
  <svg class="w-6 h-6 text-purple-600"> <!-- Cambiar aquí -->
  
// Cambiar color de botones
<button class="bg-purple-600 hover:bg-purple-700"> <!-- Cambiar aquí -->
```

### Ocultar Secciones

```typescript
// En el template, comentar o eliminar secciones:

<!-- Para ocultar estadísticas de acceso -->
<!--
<div class="grid grid-cols-2 gap-4">
  ...
</div>
-->

<!-- Para ocultar información de retención -->
<!--
<div class="bg-blue-50 rounded-lg p-4">
  ...
</div>
-->
```

### Agregar Campos Personalizados

```typescript
// En el componente, agregar nueva propiedad
export class ClientGdprPanelComponent {
  @Input() customField: string = '';
  
  // En el template:
  <div class="custom-section">
    <p>{{ customField }}</p>
  </div>
}
```

---

## 🔧 Configuración de Producción

### Paso 1: Variables de Entorno en Vercel

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agregar variables (para **Production**):

```bash
# GDPR Activation
ENABLE_GDPR=true

# DPO Information
GDPR_DPO_EMAIL=dpo@digitalizamostupyme.com
GDPR_DPO_NAME=Delegado de Protección de Datos
GDPR_DPO_PHONE=+34 XXX XXX XXX

# Retention
GDPR_RETENTION_YEARS=7
GDPR_AUTO_DELETE_AFTER_DAYS=2555

# Deadlines
GDPR_BREACH_NOTIFICATION_HOURS=72
GDPR_REQUEST_DEADLINE_DAYS=30

# Contact
GDPR_COMPANY_NAME=DigitalizamosTuPyme
GDPR_COMPANY_ADDRESS=Tu dirección completa
```

4. **Redeploy** la aplicación después de agregar variables

### Paso 2: Actualizar environment.prod.ts

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  supabase: {
    url: 'https://ufutyjbqfjrlzkprvyvs.supabase.co',
    anonKey: 'tu-anon-key-de-producción'
  },
  gdpr: {
    enabled: true, // ⚠️ IMPORTANTE: true en producción
    dpoEmail: 'dpo@digitalizamostupyme.com',
    retentionYears: 7,
    autoDeleteAfterDays: 2555,
    breachNotificationHours: 72,
    requestDeadlineDays: 30
  }
};
```

---

## 🧪 Testing

### Test Manual del Panel GDPR

1. **Abrir vista de cliente**
   - Verificar que aparece el panel GDPR
   - Verificar que se cargan los consentimientos actuales

2. **Cambiar consentimientos**
   - Marcar/desmarcar checkbox de marketing
   - Verificar que se actualiza en la base de datos
   - Recargar página y verificar que persiste

3. **Exportar datos**
   - Clic en "Exportar Datos"
   - Verificar que descarga archivo JSON
   - Abrir JSON y verificar que contiene todos los datos

4. **Solicitar eliminación**
   - Clic en "Derecho al Olvido"
   - Confirmar acción
   - Verificar que el cliente se anonimiza

5. **Verificar audit log**
   - Ir a Supabase → Table Editor → gdpr_audit_log
   - Verificar que se registraron todas las acciones

### Verificar en Supabase

```sql
-- Ver últimas acciones GDPR
SELECT 
  action_type,
  table_name,
  subject_email,
  purpose,
  created_at
FROM gdpr_audit_log
ORDER BY created_at DESC
LIMIT 20;

-- Ver consentimientos de un cliente
SELECT 
  marketing_consent,
  data_processing_consent,
  last_accessed_at,
  access_count
FROM clients
WHERE email = 'test@example.com';
```

---

## 📊 Ejemplo de Uso Completo

### Escenario: Cliente solicita copia de sus datos

```typescript
// Paso 1: Cliente accede a su perfil
ngOnInit(): void {
  this.gdprService.markClientAccessed(this.clientId).subscribe();
  // ✅ Se registra en audit_log: action_type = 'read'
}

// Paso 2: Cliente hace clic en "Exportar Datos"
exportData(): void {
  this.gdprService.downloadClientData(this.clientId, this.clientName)
    .subscribe({
      next: (success) => {
        // ✅ Se descarga JSON con todos los datos
        // ✅ Se registra en audit_log: action_type = 'export'
        console.log('Datos exportados');
      }
    });
}

// Paso 3: Verificar en base de datos
// SELECT * FROM gdpr_audit_log WHERE record_id = 'client_id'
// Resultado:
// - 1 entrada: read (al abrir perfil)
// - 1 entrada: export (al descargar datos)
```

---

## ⚠️ Importante: Próximos Pasos

### 1. Documentación Legal (OBLIGATORIO)
- [ ] Crear Política de Privacidad
- [ ] Crear Registro de Actividades de Tratamiento (RAT)
- [ ] Crear procedimiento de ejercicio de derechos
- [ ] Publicar en sitio web

### 2. Testing en Producción
- [ ] Probar con datos reales (sin producción)
- [ ] Verificar todos los triggers funcionan
- [ ] Verificar exportación de datos
- [ ] Verificar anonimización

### 3. Formación del Equipo
- [ ] Capacitar en uso del panel GDPR
- [ ] Explicar plazos de respuesta (30 días)
- [ ] Protocolo de brechas de seguridad (72h)

### 4. Configuración Final
- [ ] Variables de entorno en Vercel ✅
- [ ] URL de política de privacidad
- [ ] URL de términos y condiciones
- [ ] Contacto DPO visible

---

## 🎯 Estado Actual del Proyecto

```
✅ Base de datos GDPR (100%)
✅ Funciones RPC (7/7)
✅ Triggers automáticos (4/4)
✅ Servicio Angular (100%)
✅ Componente Panel GDPR (100%)
✅ Configuración environment (100%)

⏳ Pendiente
├─ Integrar panel en vista de clientes (5 min)
├─ Configurar variables Vercel (10 min)
├─ Crear documentación legal (2-4 horas)
└─ Testing completo (1 hora)
```

---

## 📚 Referencias

- **GDPR (Reglamento UE 2016/679)**
  - Art. 15: Derecho de acceso
  - Art. 16: Derecho de rectificación
  - Art. 17: Derecho de supresión
  - Art. 18: Derecho de limitación
  - Art. 20: Derecho de portabilidad
  - Art. 21: Derecho de oposición
  - Art. 30: Registro de actividades de tratamiento

- **Normativa Española**
  - LOPDGDD (Ley Orgánica 3/2018)
  - Retención 7 años (Código de Comercio)

- **AEPD (Agencia Española de Protección de Datos)**
  - Web: https://www.aepd.es
  - Email notificaciones: notificaciones@aepd.es
  - Teléfono: 901 100 099

---

## 🆘 Soporte

Si encuentras problemas durante la integración:

1. **Revisar consola del navegador** - Errores de TypeScript o API
2. **Revisar Supabase Logs** - Errores en funciones RPC
3. **Verificar gdpr_audit_log** - Comprobar que se registran acciones
4. **Revisar este documento** - Ejemplos de uso

**Contacto DPO**: dpo@digitalizamostupyme.com

---

## ✅ Checklist de Integración

- [ ] Importar `GDPRService` en el componente
- [ ] Agregar `ClientGdprPanelComponent` al template
- [ ] Llamar `markClientAccessed()` en `ngOnInit()`
- [ ] Configurar variables de entorno en Vercel
- [ ] Probar exportación de datos
- [ ] Probar actualización de consentimientos
- [ ] Verificar audit log en Supabase
- [ ] Crear documentación legal
- [ ] Publicar política de privacidad
- [ ] Capacitar al equipo

---

**Fecha de última actualización**: 7 de octubre de 2025
**Versión**: 1.0.0
**Estado**: ✅ Listo para integración
