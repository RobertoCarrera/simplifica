# verifactu-cert-history

Devuelve el historial de rotaciones de certificados Veri*Factu para la empresa del usuario autenticado.

## Uso
GET `functions/v1/verifactu-cert-history`
Headers: `Authorization: Bearer <access_token>`

## Respuesta
```json
{
  "ok": true,
  "history": [
    {
      "version": 2,
      "stored_at": "2025-11-18T02:05:12.123Z",
      "rotated_by": "<auth_user_id>",
      "integrity_hash": "<sha256>",
      "notes": "Auto-rotation before update",
      "cert_len": 12345,
      "key_len": 6789,
      "pass_present": true
    }
  ]
}
```

`cert_len` y `key_len` indican longitudes del contenido cifrado (no se exponen los datos).

## Seguridad
- Requiere rol owner/admin (verificado mediante tabla `public.users`).
- CORS gestionado igual que otras funciones (`ALLOW_ALL_ORIGINS` / `ALLOWED_ORIGINS`).
- RLS en la tabla `verifactu_cert_history` impide lectura para otros roles.

## Despliegue
```bash
supabase functions deploy verifactu-cert-history
```

## Extensiones/Migraciones requeridas
- Tabla `verifactu_cert_history` + RLS (ver archivos de migración en raíz del repo).

## Posibles códigos de error
`NO_AUTH`, `INVALID_TOKEN`, `NO_COMPANY`, `FORBIDDEN_ROLE`, `USER_LOOKUP_FAILED`, `HISTORY_FETCH_FAILED`, `METHOD_NOT_ALLOWED`.
