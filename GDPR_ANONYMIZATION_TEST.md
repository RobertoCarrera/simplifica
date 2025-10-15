# 🧪 Test de Anonimización GDPR - Derecho al Olvido

> **Fecha**: 7 de Octubre, 2025  
> **Propósito**: Verificar que la función de anonimización cumple con GDPR Art. 17 (Derecho al Olvido)  
> **Reversibilidad**: ⚠️ **IRREVERSIBLE** - Usar solo con datos de prueba

---

## ✅ Pre-requisitos

- [x] Modal GDPR funciona correctamente
- [x] Método `anonymizeClientData` implementado en servicio
- [x] Función RPC `anonymize_client_data` existe en Supabase
- [x] Usuario tiene permisos para anonimizar clientes

---

## 📝 Paso 1: Crear Cliente de Prueba (3 minutos)

### Datos del Cliente:

```
Nombre: Test Borrame GDPR
Apellidos: Para Eliminar
Email: test-borrame-gdpr@test.com
Teléfono: 666999888
DNI: 99999999Z
Dirección: Calle Prueba, 123, Madrid
```

### Acciones:

1. ✅ Ir a **Gestión de Clientes**
2. ✅ Click en **"+ Crear Cliente"**
3. ✅ Rellenar todos los campos con los datos de arriba
4. ✅ Guardar cliente
5. ✅ **Copiar el UUID del cliente** (aparece en la URL o inspeccionar en consola)

---

## 🎫 Paso 2: Crear Datos Relacionados (5 minutos)

### Crear Tickets:

1. ✅ Ir a **Gestión de Tickets**
2. ✅ Crear **Ticket #1**:
   - Cliente: `Test Borrame GDPR`
   - Título: `Ticket de prueba GDPR 1`
   - Descripción: `Este ticket debe permanecer después de anonimizar`
3. ✅ Crear **Ticket #2**:
   - Cliente: `Test Borrame GDPR`
   - Título: `Ticket de prueba GDPR 2`
   - Descripción: `Este ticket también debe permanecer`

### Crear Servicios (Opcional):

1. ✅ Ir a **Gestión de Servicios**
2. ✅ Crear servicio para `Test Borrame GDPR`
3. ✅ Verificar que el servicio aparece en el perfil del cliente

### Verificación:

- [ ] Cliente tiene al menos 2 tickets asociados
- [ ] Los tickets aparecen en el perfil del cliente
- [ ] El cliente aparece en la búsqueda por nombre "Test Borrame"

---

## 🔥 Paso 3: Ejecutar Anonimización (2 minutos)

### Proceso:

1. ✅ Ir a **Gestión de Clientes**
2. ✅ Buscar cliente: `Test Borrame GDPR`
3. ✅ Click en botón **GDPR** (escudo azul) para girar la tarjeta
4. ✅ Click en **"Derecho al Olvido"** (botón rojo al final)
5. ✅ **Leer confirmación**:
   ```
   ¿Estás seguro de que quieres anonimizar los datos de Test Borrame GDPR Para Eliminar?
   
   Esta acción es irreversible y cumple con el derecho al olvido del RGPD.
   ```
6. ✅ Click en **"Aceptar"**
7. ✅ Esperar notificación: `"RGPD - Datos del cliente anonimizados correctamente"`

### ⚠️ Si hay error:

- **Abrir Consola de Chrome** (F12)
- **Copiar el error completo**
- **Verificar logs de Supabase** (adjuntar captura)
- **NO continuar** hasta resolver el error

---

## 🔍 Paso 4: Verificar Anonimización en Frontend (5 minutos)

### Verificaciones en la UI:

#### ✅ Cambios en el Cliente:

- [ ] **Nombre** cambiado a: `ANONYMIZED_xxxxxxxx` (8 caracteres hexadecimales)
- [ ] **Email** cambiado a: `anonymized.xxxxxxxx@anonymized.local`
- [ ] **Teléfono**: Vacío o `NULL`
- [ ] **DNI**: Vacío o `NULL`
- [ ] **Dirección**: Anonimizada o `NULL`

#### ✅ Búsqueda:

- [ ] **Buscar por nombre original** (`Test Borrame`) → ❌ No encuentra nada
- [ ] **Buscar por email original** (`test-borrame-gdpr@test.com`) → ❌ No encuentra nada
- [ ] **Buscar por DNI original** (`99999999Z`) → ❌ No encuentra nada
- [ ] **Cliente sigue en la lista general** → ✅ Aparece como `ANONYMIZED_xxxxxxxx`

#### ✅ Datos Relacionados:

- [ ] **Tickets del cliente** → ✅ Siguen existiendo (ir a Gestión de Tickets)
- [ ] **Servicios del cliente** → ✅ Siguen existiendo (ir a Gestión de Servicios)
- [ ] **UUID del cliente** → ✅ Se mantiene igual (no cambia)
- [ ] **Tickets muestran** → `ANONYMIZED_xxxxxxxx` como cliente (no el nombre original)

#### ✅ Tarjeta GDPR:

- [ ] Girar tarjeta GDPR del cliente anonimizado
- [ ] **"Derecho al Olvido"** → ✅ Debe estar deshabilitado o mostrar mensaje "Ya anonimizado"

---

## 🗄️ Paso 5: Verificar en Supabase (10 minutos)

### 5.1 Verificar Cliente Anonimizado:

```sql
-- Buscar el cliente anonimizado (usar el UUID que copiaste en Paso 1)
SELECT 
  id,
  name,
  email,
  phone,
  dni,
  address,
  metadata,
  anonymized_at,
  updated_at
FROM clients
WHERE id = 'PASTE-UUID-AQUÍ';
```

**Resultado Esperado**:
```json
{
  "id": "original-uuid",
  "name": "ANONYMIZED_a4f3e2b1",
  "email": "anonymized.a4f3e2b1@anonymized.local",
  "phone": null,
  "dni": null,
  "address": {"anonymized": true},
  "metadata": {
    "anonymized": true,
    "original_metadata": {
      "original_email_hash": "md5-hash-del-email-original",
      "original_dni_hash": "md5-hash-del-dni-original",
      "anonymized_at": "2025-10-07T...",
      "anonymized_by": "user-uuid",
      "reason": "gdpr_erasure_request"
    }
  },
  "anonymized_at": "2025-10-07T...",
  "updated_at": "2025-10-07T..."
}
```

### 5.2 Verificar Audit Log:

```sql
-- Ver el registro de auditoría de la anonimización
SELECT 
  action_type,
  record_id,
  record_type,
  performed_by,
  action_details,
  created_at
FROM gdpr_audit_log
WHERE record_id = 'PASTE-UUID-AQUÍ'
  AND action_type = 'anonymize'
ORDER BY created_at DESC
LIMIT 5;
```

**Resultado Esperado**:
- `action_type`: `"anonymize"`
- `record_type`: `"client"`
- `action_details`: Contiene `original_email_hash`, `original_dni_hash`, `reason`
- `created_at`: Timestamp de la anonimización

### 5.3 Verificar Tickets Intactos:

```sql
-- Verificar que los tickets siguen existiendo
SELECT 
  id,
  title,
  client_id,
  status,
  created_at
FROM tickets
WHERE client_id = 'PASTE-UUID-AQUÍ'
ORDER BY created_at DESC;
```

**Resultado Esperado**:
- ✅ Todos los tickets siguen existiendo
- ✅ `client_id` sigue siendo el UUID original (sin cambios)
- ✅ Ningún dato de los tickets ha sido modificado

### 5.4 Verificar Metadata Hash:

```sql
-- Verificar que el hash MD5 coincide (validación de integridad)
SELECT 
  id,
  name,
  email,
  metadata->'original_metadata'->>'original_email_hash' as stored_hash,
  md5('test-borrame-gdpr@test.com') as expected_hash
FROM clients
WHERE id = 'PASTE-UUID-AQUÍ';
```

**Resultado Esperado**:
- `stored_hash` = `expected_hash` (coinciden perfectamente)
- Esto demuestra que el hash MD5 se guardó correctamente

---

## ✅ Checklist Final

### Funcionalidad:

- [ ] Cliente anonimizado correctamente (nombre, email, teléfono, DNI)
- [ ] UUID del cliente se mantiene
- [ ] Tickets/servicios relacionados siguen existiendo
- [ ] No se puede buscar por datos originales
- [ ] Cliente aparece en lista como `ANONYMIZED_xxxxxxxx`
- [ ] Audit log registra la acción
- [ ] Hash MD5 guardado correctamente en metadata

### Seguridad:

- [ ] No se puede recuperar el email original desde la base de datos
- [ ] No se puede recuperar el DNI original desde la base de datos
- [ ] Hash MD5 no es reversible (confirmar con herramientas online)
- [ ] Solo el usuario autorizado puede anonimizar (verificar RLS)

### UX:

- [ ] Mensaje de confirmación claro y explícito
- [ ] Notificación de éxito después de anonimizar
- [ ] Cliente anonimizado visible en la lista (no desaparece)
- [ ] No se puede volver a anonimizar un cliente ya anonimizado

---

## 📊 Resultados del Test

### Estado: 🟢 / 🟡 / 🔴

**Completado por**: _________________  
**Fecha**: _________________  
**Hora**: _________________  

### Errores Encontrados:

```
[Describir errores encontrados durante el test]
```

### Capturas de Pantalla:

1. Cliente antes de anonimizar: `[Adjuntar]`
2. Confirmación de anonimización: `[Adjuntar]`
3. Cliente después de anonimizar: `[Adjuntar]`
4. Supabase - Cliente anonimizado: `[Adjuntar]`
5. Supabase - Audit log: `[Adjuntar]`

### Notas Adicionales:

```
[Cualquier observación importante]
```

---

## 🎯 Próximos Pasos

Si el test es **exitoso** (🟢):
- [ ] Documentar el proceso en `GDPR_COMPLIANCE_GUIDE.md`
- [ ] Añadir instrucciones para usuarios finales
- [ ] Configurar variables de entorno en producción
- [ ] Realizar test en entorno de producción con datos reales de prueba

Si el test **falla** (🔴):
- [ ] Documentar el error exacto
- [ ] Adjuntar logs de Supabase
- [ ] Verificar permisos RLS en `gdpr_audit_log`
- [ ] Revisar función `anonymize_client_data` en SQL
- [ ] Solicitar asistencia técnica

---

## 📚 Referencias

- **GDPR Article 17**: Right to erasure ('right to be forgotten')
- **Función SQL**: `database/gdpr-functions-complete.sql` (línea 196)
- **Servicio Frontend**: `src/app/core/services/gdpr.service.ts`
- **Componente**: `src/app/components/supabase-customers/supabase-customers.component.ts`

---

**¡Buena suerte con el test!** 🚀
