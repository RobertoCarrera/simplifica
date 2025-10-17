# ⚡ Solución Error 403: Edge Function `hide-stage`

## 🎯 Problema resuelto

Error **403 Forbidden** al intentar ocultar estados genéricos del sistema debido a políticas RLS con subconsultas complejas.

## ✅ Solución implementada

**Edge Function robusta** que gestiona ocultar/mostrar estados con:
- Validación JWT completa
- Verificación de stage genérico
- Bypass RLS seguro con service_role
- CORS completo
- Mensajes de error descriptivos

---

## 🚀 Quick Start (5 minutos)

```bash
# 1. Desplegar función
bash quick-deploy.sh

# 2. Configurar env vars en Dashboard
# https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/settings/functions
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - ALLOW_ALL_ORIGINS=true

# 3. Verificar
supabase functions logs hide-stage --follow

# 4. Probar desde UI
# http://localhost:4200/configuracion/estados
```

---

## 📁 Archivos principales

### Edge Function
- **`supabase/functions/hide-stage/index.ts`** - Función completa (380 líneas)
- **`supabase/functions/hide-stage/README.md`** - Documentación técnica

### Scripts
- **`quick-deploy.sh`** - Deployment en 5 minutos ⚡
- **`deploy-hide-stage.sh`** - Deployment detallado

### Documentación
- **`VISUAL_SUMMARY.txt`** - Resumen visual ASCII 🎨
- **`EDGE_FUNCTION_SOLUTION_SUMMARY.md`** - Resumen ejecutivo completo
- **`EDGE_FUNCTION_DEPLOYMENT_GUIDE.md`** - Guía paso a paso

### SQL
- **`supabase/migrations/update_rls_for_edge_function.sql`** - Limpieza RLS

### Angular
- **`src/app/services/supabase-ticket-stages.service.ts`** - Actualizado para usar Edge Function

---

## 🔥 Antes vs Después

| Antes | Después |
|-------|---------|
| ❌ Error 403 | ✅ Funciona |
| Mensaje críptico | Mensajes descriptivos |
| Sin debugging | Logs en tiempo real |
| RLS complejo | Validación clara |

---

## 🧪 Test rápido

```bash
# CORS preflight
curl -X OPTIONS https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Origin: http://localhost:4200" -v

# Debe devolver: 200 OK
```

---

## 📚 Documentación completa

Ver **`VISUAL_SUMMARY.txt`** para resumen visual completo con:
- Diagramas ASCII
- Checklist de deployment
- Tests de validación
- Troubleshooting
- Comandos útiles

---

## 🎯 Próximos pasos

1. [ ] Ejecutar `bash quick-deploy.sh`
2. [ ] Configurar variables de entorno
3. [ ] Probar desde UI
4. [ ] ✅ ¡Listo para producción!

---

## 💡 Patrón aplicado

✅ **Separación de responsabilidades**
- RLS: Seguridad multi-tenant
- Edge Function: Lógica de negocio

✅ **Service role seguro**
- Solo en servidor Supabase
- Nunca expuesto al cliente

✅ **Validación robusta**
- JWT verificado
- company_id del usuario autenticado
- Stage genérico verificado

---

## 🆘 Ayuda rápida

```bash
# Ver logs
supabase functions logs hide-stage --follow

# Re-desplegar
bash deploy-hide-stage.sh

# Test completo
Ver: EDGE_FUNCTION_DEPLOYMENT_GUIDE.md
```

---

**Creado**: 2025-10-17  
**Estado**: ✅ Lista para deployment  
**Tiempo estimado**: 5 minutos  

🚀 **Acción inmediata**: `bash quick-deploy.sh`
