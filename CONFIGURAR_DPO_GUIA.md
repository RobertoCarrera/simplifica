# 🛡️ Guía de Configuración del Data Protection Officer (DPO)

## ¿Qué es un DPO?

El **Data Protection Officer (DPO)** o **Delegado de Protección de Datos** es la persona responsable de:
- Supervisar el cumplimiento del RGPD en tu organización
- Ser el punto de contacto con la Agencia Española de Protección de Datos (AEPD)
- Asesorar sobre obligaciones de protección de datos
- Gestionar solicitudes de los interesados (acceso, rectificación, cancelación, etc.)

## 📋 Pasos para Configurar el DPO

### 1. **Ejecutar la Migración GDPR**
Primero asegúrate de haber ejecutado:
```bash
# En Supabase SQL Editor
# Ejecuta el archivo: database/30-gdpr-compliance-schema.sql
```

### 2. **Identificar al DPO**
Decide quién será el DPO en tu organización. Puede ser:
- Tú mismo (como propietario del CRM)
- Un empleado con conocimientos legales
- Un DPO externo contratado

### 3. **Designar en Base de Datos**

#### Opción A: Usar las consultas SQL
```sql
-- 1. Ver usuarios disponibles
SELECT id, email, raw_user_meta_data->>'full_name' as name 
FROM public.users;

-- 2. Designar DPO (cambiar el email)
UPDATE public.users 
SET is_dpo = true, data_access_level = 'admin'
WHERE email = 'tu-email@empresa.com';
```

#### Opción B: Usar Supabase Dashboard
1. Ve a **Authentication** > **Users**
2. Encuentra tu usuario o el usuario que será DPO
3. En **User Management** > **Update user**
4. Añade en **Raw User Meta Data**:
```json
{
  "is_dpo": true,
  "dpo_designation_date": "2025-09-10",
  "dpo_certification": "internal"
}
```

### 4. **Verificación**
Ejecuta esta consulta para verificar:
```sql
SELECT 
    email, 
    is_dpo,
    data_access_level,
    CASE WHEN is_dpo = true THEN '✅ DPO Configurado' ELSE '❌ No DPO' END as status
FROM public.users 
WHERE is_dpo = true;
```

## 🔧 Efectos de la Configuración DPO

### En el Sistema:
- **Dashboard GDPR**: Solo visible para DPO y administradores
- **Acciones RGPD**: Acceso completo a funciones de compliance
- **Logs de Auditoría**: Acceso a todos los registros de auditoría
- **Gestión de Solicitudes**: Puede procesar todas las solicitudes GDPR

### En el Código:
```typescript
// El servicio DevRoleService detectará automáticamente el DPO
if (this.devRoleService.canSeeDevTools()) {
  // Mostrar dashboard GDPR
  // Permitir acciones administrativas
}
```

## 📞 Información Legal del DPO

### Datos de Contacto del DPO (Actualizar según tu caso):
```sql
-- Opcional: Guardar información de contacto del DPO
INSERT INTO public.gdpr_processing_activities (
    activity_name,
    purpose,
    legal_basis,
    data_categories,
    data_subjects,
    dpo_assessment
) VALUES (
    'DPO Contact Information',
    'GDPR Article 37 - DPO designation and contact',
    'legal_obligation',
    ARRAY['contact_info'],
    ARRAY['all_data_subjects'],
    'DPO: [Nombre] - Email: [email] - Teléfono: [teléfono] - Dirección: [dirección]'
);
```

## ✅ Checklist de Configuración

- [ ] Migración GDPR ejecutada
- [ ] Usuario DPO identificado
- [ ] Campo `is_dpo = true` configurado en base de datos
- [ ] `data_access_level = 'admin'` asignado al DPO
- [ ] Dashboard GDPR visible para el DPO
- [ ] Información de contacto del DPO documentada
- [ ] DPO formado en procedimientos GDPR

## 🚀 Siguientes Pasos

1. **Formar al DPO**: Asegurar conocimiento de procedimientos GDPR
2. **Documentar contacto**: Actualizar política de privacidad con datos del DPO
3. **Probar workflows**: Verificar que el DPO puede gestionar solicitudes
4. **Configurar notificaciones**: Email alerts para nuevas solicitudes GDPR

## 📧 Contacto DPO (Plantilla para Política de Privacidad)

```
DELEGADO DE PROTECCIÓN DE DATOS (DPO)
Nombre: [Nombre del DPO]
Email: dpo@[tu-empresa].com
Dirección: [Dirección de tu empresa]
Teléfono: [Teléfono de contacto]

Puedes contactar con nuestro DPO para cualquier consulta relacionada con:
- Ejercicio de derechos GDPR
- Consultas sobre tratamiento de datos
- Reclamaciones sobre protección de datos
```
