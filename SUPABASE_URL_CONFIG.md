# CONFIGURACIÓN SUPABASE PARA PRODUCCIÓN

## 1. Site URL (URL del sitio principal)
```
https://simplifica.digitalizamostupyme.es
```

## 2. Redirect URLs (URLs de redirección permitidas)
```
https://simplifica.digitalizamostupyme.es/login
https://simplifica.digitalizamostupyme.es/auth/callback
https://simplifica.digitalizamostupyme.es/**
http://localhost:4200/login
http://localhost:4200/auth/callback
http://localhost:4200/**
```

## 3. PASOS EN SUPABASE DASHBOARD:

1. Ve a: **Authentication > URL Configuration**
2. **Site URL**: `https://simplifica.digitalizamostupyme.es`
3. **Redirect URLs**: Agrega las URLs de arriba una por una
4. **Save changes**

## 4. CONFIGURAR MAILGUN/SENDGRID (si usas proveedores externos):

En **Authentication > Email templates**:
- Confirma que los enlaces de invitación apunten a: `{{ .SiteURL }}/auth/callback`
