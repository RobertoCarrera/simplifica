# Reporte de Seguridad - Febrero 2026

## Resumen Ejecutivo
Se ha realizado una auditoría de seguridad sobre los componentes críticos de la plataforma Simplifica, enfocándose en la capa de datos (RLS), Edge Functions y lógica financiera. Se han detectado 2 hallazgos de severidad **CRÍTICA** y **ALTA** que requieren atención inmediata.

## Hallazgos

### 1. [CRÍTICO] Uso de columnas deprecadas para autorización en lógica financiera
**Componente:** Base de Datos (Función `convert_quote_to_invoice`)
**Archivo:** `supabase/migrations/20260129160000_finance_security_logic.sql`

**Descripción:**
La función `convert_quote_to_invoice` utiliza la columna `public.users.company_id` para verificar si un usuario tiene permiso para convertir un presupuesto en factura. Esta columna está **deprecada** en favor de la tabla `public.company_members` (modelo many-to-many).

**Riesgo:**
- **Fuga de datos / Escalada de privilegios:** Si la columna `company_id` en `users` no se actualiza o sincroniza correctamente (dado que ahora la verdad está en `company_members`), un usuario podría perder acceso legítimo o mantener acceso indebido a una empresa antigua.
- **Inconsistencia:** La lógica de seguridad difiere del resto de la aplicación, que ya valida contra `company_members`.

**Mitigación Propuesta:**
- Actualizar la función para verificar la membresía activa en `public.company_members` usando `auth.uid()`.

---

### 2. [ALTO] Endpoints de depuración expuestos en Edge Function crítica
**Componente:** Edge Functions (`verifactu-dispatcher`)
**Archivo:** `supabase/functions/verifactu-dispatcher/index.ts`

**Descripción:**
La función `verifactu-dispatcher` expone endpoints de depuración (`debug-env`, `debug-test-update`, `diag`) que devuelven variables de entorno y estado interno sin comprobaciones de autenticación adecuadas para el contexto de producción.

**Riesgo:**
- **Exposición de Información:** `debug-env` devuelve claves de configuración y estado del sistema.
- **Manipulación de Datos:** `debug-test-update` permite modificar intentos de reintento de eventos arbitrarios si se conoce el `company_id`.

**Mitigación Propuesta:**
- Eliminar los bloques de código relacionados con `debug-*` y `diag` en el entorno de producción.
- Asegurar que cualquier acción manual (`retry`) pase por `requireInvoiceAccess`.

---

### 3. [MEDIO] Asunciones hardcodeadas en generación de facturas
**Componente:** Base de Datos (Función `convert_quote_to_invoice`)
**Archivo:** `supabase/migrations/20260129160000_finance_security_logic.sql`

**Descripción:**
Al convertir un presupuesto, se asume `currency = 'EUR'` y `tax_rate = 0` para los items, ignorando potencialmente la configuración del presupuesto original.

**Riesgo:**
- **Integridad de Datos:** Generación de facturas incorrectas si el presupuesto estaba en otra moneda o tenía impuestos definidos.

**Mitigación Propuesta:**
- Leer `currency` de la tabla `quotes` (si existe) o permitir su paso como parámetro.
- Copiar `tax_rate` de `quote_items` si está disponible.

---

## Plan de Acción
1. **Inmediato:** Migración para corregir `convert_quote_to_invoice` eliminando la dependencia de `users.company_id` y mejorando la copia de datos.
2. **Inmediato:** Limpieza de endpoints de debug en `verifactu-dispatcher`.
