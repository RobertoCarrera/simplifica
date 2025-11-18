# upload-verifactu-cert

Edge Function para almacenar configuración Veri*Factu y certificados cifrados por empresa.

## Flujo
1. El cliente procesa el .p12 / PEM y cifra cert/key con AES-GCM.
2. Envía `cert_pem_enc`, `key_pem_enc`, `key_pass_enc (nullable)` junto con `software_code`, `issuer_nif`, `environment`.
3. La función valida JWT, obtiene `company_id` y `role` desde `public.users`.
4. Verifica rol (owner/admin).
5. Upsert en `public.verifactu_settings` (conflicto por `company_id`).
6. Limpia columnas legacy en texto plano (`cert_pem`, `key_pem`, `key_passphrase`) poniendo `NULL`.

## Seguridad
- Cifrado cliente: las claves nunca se almacenan en claro en la tabla.
- RLS (verifactu_settings_rls.sql) protege SELECT/UPDATE/INSERT para owner/admin.
- La función usa service role para bypass de RLS solo en escritura controlada.

## Variables de entorno CORS
`ALLOW_ALL_ORIGINS=true` (desarrollo) o `ALLOWED_ORIGINS=http://localhost:4200,https://tu-dominio.com`.

## Despliegue
```bash
supabase secrets set ALLOW_ALL_ORIGINS=true
supabase functions deploy upload-verifactu-cert
```

## Respuestas
`200 { ok: true }` éxito.
Errores: `NO_AUTH`, `INVALID_TOKEN`, `NO_COMPANY`, `FORBIDDEN_ROLE`, `INVALID_JSON`, `INVALID_PAYLOAD`, `USER_LOOKUP_FAILED`, `UPSERT_FAILED`.

## Próximas mejoras
- Rotación implementada: verifactu_cert_history almacena versiones previas cifradas.
- Endpoint de auditoría: verifactu-cert-history (solo owner/admin) devuelve metadatos.
- Pendiente: Integrar firma digital y validación de caducidad.
