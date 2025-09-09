# 🚀 GUÍA DE DEPLOYMENT A VERCEL

## 1. PREPARAR CREDENCIALES DE SUPABASE

1. **Ve a tu dashboard de Supabase**: https://app.supabase.com
2. **Selecciona tu proyecto**
3. **Ve a Settings > API**
4. **Copia estos valores**:
   - **Project URL**: `https://tu-proyecto.supabase.co`
   - **Anon public key**: `eyJ0eXAiOiJKV1QiLCJhbGciOiJ...`

## 2. CONFIGURAR VERCEL

### A) Instalar Vercel CLI:
```bash
npm install -g vercel
```

### B) Login en Vercel:
```bash
vercel login
```

### C) Deploy inicial:
```bash
# En la carpeta del proyecto
vercel

# Responder las preguntas:
# ? Set up and deploy "~/simplifica"? [Y/n] y
# ? Which scope do you want to deploy to? [Tu usuario]
# ? Link to existing project? [y/N] n
# ? What's your project's name? simplifica
# ? In which directory is your code located? ./
```

### D) Configurar variables de entorno en Vercel:
```bash
# Opción 1: Por comando
vercel env add SUPABASE_URL
# Pegar tu Project URL de Supabase

vercel env add SUPABASE_ANON_KEY
# Pegar tu Anon Key de Supabase

# Opción 2: En el Dashboard de Vercel
# 1. Ve a tu proyecto en vercel.com
# 2. Settings > Environment Variables
# 3. Agregar:
#    - Name: SUPABASE_URL, Value: https://tu-proyecto.supabase.co
#    - Name: SUPABASE_ANON_KEY, Value: tu-anon-key
```

### E) Deploy a producción:
```bash
vercel --prod
```

## 3. CONFIGURAR DOMINIO PERSONALIZADO

### En Vercel Dashboard:
1. **Ve a tu proyecto** en vercel.com
2. **Settings > Domains**
3. **Add Domain**: `simplifica.digitalizamostupyme.es`
4. **Configurar DNS** en tu proveedor:
   - Tipo: `CNAME`
   - Host: `simplifica`
   - Value: `cname.vercel-dns.com`

## 4. CONFIGURAR SUPABASE PARA PRODUCCIÓN

### En Supabase Dashboard:
1. **Authentication > URL Configuration**
2. **Site URL**: `https://simplifica.digitalizamostupyme.es`
3. **Redirect URLs** (agregar uno por uno):
   ```
   https://simplifica.digitalizamostupyme.es/auth/callback
   https://simplifica.digitalizamostupyme.es/login
   https://simplifica.digitalizamostupyme.es/**
   ```

## 5. EJECUTAR SCRIPTS DE BASE DE DATOS

### En Supabase SQL Editor:
```sql
-- 1. Ejecutar: database/setup-dev-user.sql
-- 2. Ejecutar: database/setup-invitations.sql
```

## 6. VERIFICAR DEPLOYMENT

1. **Login**: https://simplifica.digitalizamostupyme.es/login
2. **Test callback**: Enviar invitación desde Supabase
3. **Verificar redirecciones**

## 7. COMANDOS ÚTILES

```bash
# Ver logs de deployment
vercel logs

# Ver información del proyecto
vercel inspect

# Re-deploy
vercel --prod

# Ver variables de entorno
vercel env ls
```

## 8. TROUBLESHOOTING

### Si aparece error de variables de entorno:
1. Verificar que están configuradas en Vercel
2. Verificar que los nombres coincidan: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
3. Re-deploy: `vercel --prod`

### Si no funciona el routing:
- El archivo `vercel.json` debe estar en la raíz
- Verificar que `distDir` apunte a `dist/simplifica/browser`

### Si fallan las redirecciones de auth:
- Verificar URLs en Supabase Dashboard
- Verificar que `/auth/callback` esté en las rutas de Angular
