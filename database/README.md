# Base de Datos Multi-Tenant para Simplifica CRM

Esta carpeta contiene los scripts SQL para configurar una base de datos multi-tenant segura y funcional en Supabase.

## 🚀 Instalación Rápida

### Paso 1: Ejecutar Scripts en Orden

Copia y pega cada script en el **SQL Editor** de Supabase Dashboard en este orden:

1. **01-setup-multitenant.sql** - Estructura básica de tablas y datos de ejemplo
2. **02-setup-rls.sql** - Políticas de seguridad multi-tenant
3. **03-setup-storage.sql** - Sistema de archivos seguro

### Paso 2: Crear Bucket de Storage

En Supabase Dashboard:
1. Ir a **Storage** → **Create Bucket**
2. Name: `attachments`
3. **NO** marcar como público
4. Guardar

### Paso 3: Verificar Instalación

Ejecuta este test en SQL Editor:

```sql
-- Test básico
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000001');
SELECT count(*) as clients_company_1 FROM public.clients;

SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000002'); 
SELECT count(*) as clients_company_2 FROM public.clients;
```

Deberías ver 1 cliente para cada empresa.

## 📋 Estructura de la Base de Datos

### Tablas Principales

- **companies** - Empresas/organizaciones
- **users** - Usuarios de cada empresa
- **clients** - Clientes de cada empresa
- **services** - Servicios ofrecidos por cada empresa
- **jobs** - Trabajos/tickets (servicios o reparaciones)
- **job_notes** - Notas de los trabajos
- **attachments** - Archivos adjuntos

### Características de Seguridad

✅ **Multi-tenant completo** - Cada empresa solo ve sus datos  
✅ **Soft delete** - Los registros se marcan como eliminados  
✅ **UUIDs** - Identificadores únicos seguros  
✅ **Timestamps automáticos** - created_at/updated_at  
✅ **Índices optimizados** - Consultas rápidas  

## 🔒 Sistema Multi-Tenant

### Funcionamiento

Cada consulta debe ejecutarse en el contexto de una empresa:

```sql
-- Establecer contexto de empresa
SELECT public.set_current_company_context('uuid-de-empresa');

-- Ahora todas las consultas respetan el multi-tenancy
SELECT * FROM clients; -- Solo clientes de esa empresa
```

### En tu Aplicación Angular

```typescript
// En tu servicio de Supabase
async setCompanyContext(companyId: string) {
  await this.supabase.rpc('set_current_company_context', {
    company_uuid: companyId
  });
}

// Usar antes de cualquier operación
await this.supabaseService.setCompanyContext(this.currentCompany.id);
const clients = await this.supabase.from('clients').select('*');
```

## 📁 Sistema de Archivos

### Estructura de Archivos en Storage

```
attachments/
├── company-uuid-1/
│   ├── attachments/
│   │   ├── 1623456789_document.pdf
│   │   └── 1623456790_image.jpg
│   └── general/
│       └── 1623456791_file.docx
└── company-uuid-2/
    ├── attachments/
    └── general/
```

### Subir Archivos (Angular)

```typescript
async uploadJobAttachment(jobId: string, file: File) {
  // 1. Generar ruta segura
  const { data: filePath } = await this.supabase
    .rpc('generate_file_path', {
      company_uuid: this.currentCompanyId,
      file_name: file.name,
      subfolder: 'attachments'
    });

  // 2. Subir archivo
  const { error: uploadError } = await this.supabase.storage
    .from('attachments')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  // 3. Crear registro en BD
  const { data: attachment } = await this.supabase
    .rpc('create_attachment', {
      p_company_id: this.currentCompanyId,
      p_job_id: jobId,
      p_file_name: file.name,
      p_file_size: file.size,
      p_mime_type: file.type
    });

  return attachment;
}
```

### Obtener URL de Descarga

```typescript
async getAttachmentUrl(filePath: string): Promise<string> {
  const { data } = await this.supabase.storage
    .from('attachments')
    .createSignedUrl(filePath, 60 * 5); // 5 minutos

  return data?.signedUrl || '';
}
```

## 🧪 Testing

### Datos de Ejemplo

El sistema viene con 2 empresas de ejemplo:

- **Empresa Demo 1** (ID: `00000000-0000-4000-8000-000000000001`)
- **Empresa Demo 2** (ID: `00000000-0000-4000-8000-000000000002`)

### Tests Automáticos

Los scripts incluyen tests automáticos que verifican:
- ✅ Multi-tenancy funcionando
- ✅ RLS bloqueando acceso entre empresas
- ✅ Sistema de archivos validando rutas
- ✅ Funciones helper trabajando correctamente

## 🔧 Configuración para Producción

### 1. Integrar con Auth

Actualizar la función `get_current_company_id()`:

```sql
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid AS $$
DECLARE
  user_company_id uuid;
BEGIN
  -- Obtener company_id del usuario autenticado
  SELECT company_id INTO user_company_id
  FROM public.users
  WHERE id = auth.uid() AND deleted_at IS NULL;
  
  RETURN user_company_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### 2. Quitar Políticas Temporales

Una vez configurado auth, remover la condición `OR get_current_company_id() IS NULL` de todas las políticas RLS.

### 3. Configurar Edge Functions

Para operaciones complejas, crear Edge Functions que:
1. Validen permisos del usuario
2. Establezcan contexto de empresa
3. Ejecuten operaciones con service_role

## ❗ Importante

- ⚠️ **NUNCA** exponer `service_role` key en el frontend
- ⚠️ **SIEMPRE** establecer contexto de empresa antes de operaciones
- ⚠️ **VALIDAR** permisos en operaciones críticas
- ⚠️ **USAR** signed URLs para acceso a archivos

## 🆘 Solución de Problemas

### Error: "No se ven datos después de establecer contexto"

```sql
-- Verificar que el contexto está establecido
SELECT current_setting('app.current_company_id', true);

-- Verificar datos sin contexto (temporal)
SELECT set_config('app.current_company_id', '', true);
SELECT count(*) FROM clients;
```

### Error: "No se pueden subir archivos"

1. Verificar que el bucket `attachments` existe
2. Verificar que no está marcado como público
3. Usar las funciones helper proporcionadas

### Error: "RLS impide operaciones"

Durante desarrollo, temporalmente:

```sql
-- SOLO PARA DESARROLLO - QUITAR EN PRODUCCIÓN
ALTER TABLE nombre_tabla DISABLE ROW LEVEL SECURITY;
```

## 📞 Soporte

Si tienes problemas con la configuración:

1. Verificar que todos los scripts se ejecutaron sin errores
2. Revisar que el bucket de storage existe
3. Comprobar que el contexto de empresa está establecido
4. Ejecutar los tests incluidos en los scripts

---

**✨ ¡Tu base de datos multi-tenant está lista para usar!**
