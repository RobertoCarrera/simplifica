# VeriFactu + GDPR Hardening Checklist (Server-side)

Estado inicial: enfocamos cambios pequeños y seguros en lotes. Marcaré progreso aquí.

## Prioridad 1 — Seguridad de endpoints y flujo de cierre
- [ ] Unificar CORS estricto (ALLOW_ALL_ORIGINS=false; ALLOWED_ORIGINS listado) y rechazar origins no permitidos.
- [x] Idempotencia básica en `invoices-finalize` (si ya finalizada, devolver OK sin re-ejecutar).
- [ ] Validar `origin` en todos los edge functions con CORS común.
- [ ] Derivar siempre `company_id` del usuario/recurso; no aceptar `pcompanyid` del body.
- [ ] `quotes-accept`: exigir token con secreto en producción; rechazar reuso.

## Prioridad 2 — Inmutabilidad y cadena de integridad
- [ ] Serialización canónica + hash SHA-256 de campos protegidos en cierre.
- [ ] Política RLS/trigger: prohibir UPDATE/DELETE tras `finalized_at` (solo `cancel_invoice()` y eventos append-only).
- [ ] Index/idempotencia para eventos y despacho (evitar duplicados, DLQ)

## Prioridad 3 — Certificados y datos sensibles
- [ ] Cifrado server-side de certificados VeriFactu con KMS/HSM + rotación.
- [ ] Auditoría de acceso y redactar PII/secrets en logs.

## Prioridad 4 — Retención y derechos GDPR
- [ ] Jobs de purga/pseudonimización de logs no fiscales.
- [ ] Endpoint de exportación de datos del interesado (limitado por obligación fiscal).

Notas de despliegue:
- Coordinar cambios SQL antes de habilitar triggers/RLS en `invoices` para evitar cortes.
- Mantener `ALLOW_ALL_ORIGINS=true` solo en entornos de desarrollo.
