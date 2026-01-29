# Auditoría de Seguridad - Simplifica (Feb 2026)

**Fecha:** 2026-02-04
**Auditor:** Jules (Security Engineer Agent)
**Estado:** CRÍTICO

## Resumen Ejecutivo
Se han detectado vulnerabilidades críticas recurrentes (regresiones) en las Edge Functions que exponen la lógica financiera y de infraestructura a ataques remotos no autenticados. Estas vulnerabilidades coinciden con reportes previos de reversiones del código a un estado inseguro (Jan 2026).

## Hallazgos

### 1. Edge Function `aws-manager` (CRÍTICO)
- **Vulnerabilidad:** Falta total de autenticación.
- **Descripción:** La función acepta peticiones `POST` sin validar el header `Authorization`. Cualquier actor puede invocar `register-domain` con un payload JSON arbitrario.
- **Impacto:**
  - Registro de dominios a cargo de la empresa (pérdida financiera directa).
  - Denegación de servicio (agotamiento de cuotas AWS).
  - Enumeración de infraestructura.
- **Ubicación:** `supabase/functions/aws-manager/index.ts`

### 2. Edge Function `verifactu-dispatcher` (CRÍTICO)
- **Vulnerabilidad:** IDOR y Endpoints de Debug Inseguros.
- **Descripción:**
  - Existen endpoints de depuración (`debug-test-update`, `debug-env`, `debug-last-event`) accesibles sin autenticación.
  - El endpoint `debug-env` expone variables de entorno.
  - El endpoint `debug-test-update` permite modificar el estado de eventos de facturación arbitrariamente (ej: forzar reintentos infinitos, cambiar errores).
  - Uso de `SUPABASE_SERVICE_ROLE_KEY` en el ámbito global del script, inicializando un cliente admin para todas las peticiones, incluso las no autorizadas.
- **Impacto:**
  - Manipulación de estados de facturación ante la AEAT.
  - Fuga de información sensible (claves, configuración).
  - Posible interrupción del servicio de facturación.
- **Ubicación:** `supabase/functions/verifactu-dispatcher/index.ts`

### 3. Base de Datos / RLS (ALTO/MEDIO)
- **Vulnerabilidad:** Dependencia de columna deprecada `public.users.company_id`.
- **Descripción:** La función RPC `convert_quote_to_invoice` utiliza `public.users.company_id` para validar la pertenencia a una empresa, en lugar de consultar la tabla `company_members`.
- **Impacto:** Si la columna `company_id` en `users` no está sincronizada o es NULL, la lógica de seguridad puede fallar (denegando acceso legítimo o permitiendo ilegítimo en casos de carrera).
- **Ubicación:** Migración `20260129160000_finance_security_logic.sql`

### 4. Frontend (INFO)
- **Estado:** Configuración aparentemente segura.
- **Observación:** Se utiliza `process.env` en `environment.prod.ts`. Se detectó `anychatApiKey` vacía o dependiente de `ANYCHAT_API_KEY`. Verificar que esta clave no tenga permisos elevados si se expone al cliente.

## Plan de Acción Inmediato
1. **Reforzar `aws-manager`:** Implementar validación de token JWT de Supabase Auth antes de ejecutar comandos AWS.
2. **Limpiar `verifactu-dispatcher`:** Eliminar endpoints de debug y restringir el uso del cliente Admin.

---
*Este reporte ha sido generado automáticamente por el agente de seguridad.*
