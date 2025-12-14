# Integración con Supabase MCP (Model Context Protocol)

Este documento explica cómo los modelos de IA pueden interactuar directamente con la base de datos Supabase del proyecto.

## Herramientas Disponibles

El proyecto tiene configurado el **Supabase MCP Server**, que proporciona las siguientes herramientas:

### 1. `mcp_supabase_execute_sql`
Ejecuta consultas SQL directamente en la base de datos PostgreSQL.

**Uso:**
```
mcp_supabase_execute_sql({
  query: "SELECT * FROM services LIMIT 5"
})
```

**Casos de uso:**
- Consultar datos para debugging
- Verificar estructura de tablas
- Comprobar políticas RLS
- Validar datos insertados

### 2. `mcp_supabase_apply_migration`
Aplica migraciones DDL (CREATE, ALTER, DROP) a la base de datos.

**Uso:**
```
mcp_supabase_apply_migration({
  name: "add_new_column_to_services",
  query: "ALTER TABLE services ADD COLUMN new_field TEXT"
})
```

**Casos de uso:**
- Crear nuevas tablas
- Añadir columnas
- Crear índices
- Añadir políticas RLS
- Crear funciones/triggers

### 3. Otras herramientas disponibles (activar si es necesario)
- `mcp_supabase_list_branches` - Listar ramas de desarrollo
- `mcp_supabase_deploy_edge_function` - Desplegar Edge Functions
- `mcp_supabase_get_logs` - Obtener logs del proyecto
- `mcp_supabase_generate_typescript_types` - Generar tipos TypeScript

## Configuración del Proyecto

El proyecto está conectado a:
- **URL:** `https://ufutyjbqfjrlzkprvyvs.supabase.co`
- **Proyecto ID:** `ufutyjbqfjrlzkprvyvs`

Las credenciales están en `.env.local`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN`

## Ejemplos de Consultas Útiles

### Ver estructura de una tabla
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'services'
ORDER BY ordinal_position;
```

### Ver políticas RLS de una tabla
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'nombre_tabla';
```

### Ver servicios públicos con variantes
```sql
SELECT 
  s.id, s.name, s.is_public,
  sv.variant_name, sv.pricing
FROM services s
LEFT JOIN service_variants sv ON sv.service_id = s.id
WHERE s.is_public = true AND s.is_active = true;
```

### Verificar si RLS está habilitado
```sql
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname IN ('services', 'service_variants');
```

## Flujo de Trabajo Recomendado

1. **Antes de modificar código**, usar `mcp_supabase_execute_sql` para:
   - Verificar la estructura actual de las tablas
   - Comprobar qué datos existen
   - Validar las políticas RLS

2. **Para cambios de esquema**, usar `mcp_supabase_apply_migration`:
   - Siempre dar un nombre descriptivo a la migración
   - Las migraciones se guardan en el historial de Supabase

3. **Para debugging de frontend**:
   - Ejecutar la misma consulta que hace el servicio Angular
   - Comparar resultados con lo que debería ver el usuario
   - Verificar si las RLS policies permiten el acceso

## Notas Importantes

- Las consultas con `execute_sql` se ejecutan con permisos de `service_role` (bypass RLS)
- Para probar lo que vería un usuario específico, usar `auth.uid()` en las consultas
- Las migraciones son permanentes - no se pueden deshacer automáticamente
- Siempre hacer backup o confirmar antes de DDL destructivos (DROP, TRUNCATE)

## Problema Común: RLS Policies

Si los datos no aparecen en el frontend pero sí en consultas directas, el problema suele ser **RLS policies**. Verificar:

1. ¿Tiene la tabla RLS habilitado?
2. ¿Existe una policy de SELECT para el rol `authenticated`?
3. ¿La policy permite ver los datos específicos que necesita el usuario?

Ejemplo de política permisiva para clientes:
```sql
CREATE POLICY "Clients can view public services"
ON services FOR SELECT
TO authenticated
USING (is_public = true);
```
