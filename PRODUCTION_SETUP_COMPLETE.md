# GUÍA COMPLETA DE CONFIGURACIÓN PARA PRODUCCIÓN

## 1. CONFIGURACIÓN EN SUPABASE DASHBOARD

### A) URL Configuration (Authentication > URL Configuration):
```
Site URL: https://simplifica.digitalizamostupyme.es
```

### B) Redirect URLs (agregar una por una):
```
https://simplifica.digitalizamostupyme.es/auth/callback
https://simplifica.digitalizamostupyme.es/login
https://simplifica.digitalizamostupyme.es/**
http://localhost:4200/auth/callback
http://localhost:4200/login
http://localhost:4200/**
```

### C) Email Templates (Authentication > Email Templates):
1. **Invite user template** - Cambiar el enlace a:
   ```
   {{ .SiteURL }}/auth/callback?token={{ .Token }}&type=invite
   ```

2. **Confirm signup template** - Cambiar el enlace a:
   ```
   {{ .SiteURL }}/auth/callback?token={{ .Token }}&type=signup
   ```

3. **Reset password template** - Cambiar el enlace a:
   ```
   {{ .SiteURL }}/auth/callback?token={{ .Token }}&type=recovery
   ```

## 2. ACTUALIZAR ENVIRONMENT PRODUCTION

Edita: `src/environments/environment.prod.ts`

```typescript
export const environment = {
  production: true,
  supabase: {
    url: 'TU_SUPABASE_PROJECT_URL', // ej: https://abcdefgh.supabase.co
    anonKey: 'TU_SUPABASE_ANON_KEY'  
  }
};
```

## 3. EJECUTAR SCRIPTS EN SUPABASE

### A) Ejecutar script de usuario dev:
```sql
-- En Supabase SQL Editor, ejecutar:
```
(Contenido del archivo setup-dev-user.sql)

### B) Ejecutar script de invitaciones:
```sql
-- En Supabase SQL Editor, ejecutar:
```
(Contenido del archivo setup-invitations.sql)

## 4. COMANDOS PARA PRODUCCIÓN

### A) Build optimizado:
```bash
npm run build
```

### B) Deploy a Vercel:
```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Configurar dominio personalizado
vercel domains add simplifica.digitalizamostupyme.es
```

## 5. VERIFICAR FUNCIONAMIENTO

1. **Test login normal**: https://simplifica.digitalizamostupyme.es/login
2. **Test invitación**: Enviar invitación desde Supabase Dashboard
3. **Test callback**: El enlace debe redirigir a `/auth/callback`
4. **Test redirección**: Después del login debe ir al dashboard

## 6. TROUBLESHOOTING

### Si aparece "requested path is invalid":
- Verificar que las URL en Supabase estén exactamente como arriba
- Verificar que el componente AuthCallbackComponent esté cargando
- Verificar que la ruta `/auth/callback` esté en app.routes.ts

### Si las notificaciones siguen apareciendo:
- Verificar que app.component.ts no tenga notificaciones en constructor
- Verificar que ningún componente esté disparando toasts automáticamente

### Si el sidebar aparece en login:
- Verificar que ResponsiveLayoutComponent.isAuthenticated() funcione
- Verificar que AuthService.isAuthenticated signal esté funcionando
