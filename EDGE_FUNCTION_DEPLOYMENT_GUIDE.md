# =====================================================
# EDGE FUNCTION DEPLOYMENT GUIDE
# =====================================================
# Guía completa para desplegar hide-stage Edge Function
# =====================================================

## 🎯 Resumen Ejecutivo

**Problema resuelto**: Error 403 al intentar ocultar estados genéricos debido a políticas RLS complejas.

**Solución**: Edge Function con service_role que valida y escribe directamente en `hidden_stages`.

**Estado**: ✅ Código listo, pendiente deployment

---

## 📋 Pre-requisitos

- [x] Supabase CLI instalado
- [x] Autenticado: `supabase login`
- [x] Edge Function creada en `supabase/functions/hide-stage/`
- [x] Service Angular actualizado para usar Edge Function

---

## 🚀 Deployment paso a paso

### Paso 1: Verificar archivos

```bash
cd f:/simplifica

# Verificar que existe la función
ls supabase/functions/hide-stage/index.ts
# Debe mostrar: supabase/functions/hide-stage/index.ts
```

### Paso 2: Desplegar función

**Opción A - Script automatizado (recomendado)**:
```bash
bash deploy-hide-stage.sh
```

**Opción B - Comando manual**:
```bash
supabase functions deploy hide-stage --project-ref ufutyjbqfjrlzkprvyvs
```

Salida esperada:
```
Deploying function hide-stage (project ref: ufutyjbqfjrlzkprvyvs)...
✓ Function deployed successfully
```

### Paso 3: Configurar variables de entorno

1. Abre Supabase Dashboard:
   https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/settings/functions

2. Click en "Add secret"

3. Añadir las siguientes variables:

```
Nombre: SUPABASE_URL
Valor: https://ufutyjbqfjrlzkprvyvs.supabase.co

Nombre: SUPABASE_SERVICE_ROLE_KEY
Valor: <copiar desde Project Settings > API > service_role key>

Nombre: ALLOW_ALL_ORIGINS
Valor: true
```

4. Guardar y reiniciar función si es necesario

### Paso 4: Verificar deployment

```bash
# Ver logs en tiempo real
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --follow
```

En otra terminal, hacer una prueba OPTIONS:
```bash
curl -X OPTIONS \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Origin: http://localhost:4200" \
  -v
```

Debe devolver `200 OK` con headers CORS.

---

## 🧪 Pruebas de validación

### Test 1: Sin autorización (debe fallar)

```bash
curl -X POST \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Content-Type: application/json" \
  -d '{"p_stage_id": "test", "p_operation": "hide"}'
```

**Esperado**: `{"error":"Missing or invalid authorization"}`

### Test 2: Con autorización válida

Primero obtener token JWT:
1. Abre tu app Angular en desarrollo
2. Abre DevTools > Console
3. Ejecuta: `localStorage.getItem('sb-ufutyjbqfjrlzkprvyvs-auth-token')`
4. Copia el `access_token` del JSON

Luego probar:
```bash
TOKEN="tu-token-aquí"

curl -X POST \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_stage_id": "uuid-de-un-estado-generico",
    "p_operation": "hide"
  }'
```

**Esperado**: `{"result": {...}}` con detalles del estado oculto

### Test 3: Desde Angular (end-to-end)

1. Refrescar app: `http://localhost:4200`
2. Ir a Configuración > Gestionar Estados
3. Click en "Ocultar" en un estado genérico
4. **Debe funcionar sin error 403**
5. El estado debe mostrarse con badge "Oculto"
6. Click en "Mostrar" debe revertir la operación

---

## 🔍 Troubleshooting

### Error: "Function not found"

**Causa**: No está desplegada o el nombre es incorrecto

**Solución**:
```bash
supabase functions list --project-ref ufutyjbqfjrlzkprvyvs
# Debe aparecer 'hide-stage'

# Si no aparece, desplegar:
supabase functions deploy hide-stage --project-ref ufutyjbqfjrlzkprvyvs
```

### Error: "Missing SUPABASE_SERVICE_ROLE_KEY"

**Causa**: Variables de entorno no configuradas

**Solución**:
1. Dashboard > Project Settings > API
2. Copiar `service_role` key (secret)
3. Dashboard > Edge Functions > Settings
4. Add secret: `SUPABASE_SERVICE_ROLE_KEY`

### Error 401 en pruebas

**Causa**: Token JWT expirado o inválido

**Solución**:
1. Obtener nuevo token desde localStorage
2. Verificar que el token sea del usuario correcto
3. Verificar que el usuario tiene company_id

### Error: "Origin not allowed"

**Causa**: CORS no configurado o dominio no permitido

**Solución**:
```bash
# En variables de entorno:
ALLOW_ALL_ORIGINS=true

# O específicos:
ALLOWED_ORIGINS=http://localhost:4200,https://tudominio.com
```

### Logs no aparecen

**Causa**: Puede tomar unos segundos después del deployment

**Solución**:
```bash
# Esperar 30 segundos y volver a intentar
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --limit 50
```

---

## 📊 Verificación post-deployment

### Checklist

- [ ] Función aparece en `supabase functions list`
- [ ] Variables de entorno configuradas (3 vars)
- [ ] Test OPTIONS devuelve 200
- [ ] Test POST sin auth devuelve 401
- [ ] Test POST con auth válido devuelve 200
- [ ] Logs visibles con `supabase functions logs`
- [ ] Angular service actualizado y compilando
- [ ] Test end-to-end desde UI funciona
- [ ] Estado se oculta correctamente
- [ ] Estado se muestra correctamente

### Comando de verificación rápida

```bash
# Ver estado general
echo "1. Listando funciones..."
supabase functions list --project-ref ufutyjbqfjrlzkprvyvs

echo ""
echo "2. Últimos 10 logs..."
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --limit 10

echo ""
echo "3. Test OPTIONS..."
curl -X OPTIONS https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage -H "Origin: http://localhost:4200" -v 2>&1 | grep "< HTTP"

echo ""
echo "✅ Verificación completada"
```

---

## 🔄 Actualizar función

Si necesitas hacer cambios:

```bash
# 1. Editar código
code supabase/functions/hide-stage/index.ts

# 2. Re-desplegar (sobrescribe versión anterior)
supabase functions deploy hide-stage --project-ref ufutyjbqfjrlzkprvyvs

# 3. Verificar logs
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --follow
```

No es necesario actualizar variables de entorno si no cambian.

---

## 📈 Próximos pasos después del deployment exitoso

1. ✅ **Borrar RLS policies innecesarias** (ya no necesitamos la validación compleja)
2. ✅ **Simplificar políticas** a solo verificación de company_id
3. ✅ **Documentar en equipo** el uso de Edge Function
4. ✅ **Monitorear logs** durante primeros días
5. ✅ **Considerar rate limiting** si es necesario

---

## 🎓 Lecciones aprendidas

1. **RLS tiene limitaciones**: Subconsultas complejas en WITH CHECK pueden fallar
2. **Edge Functions son poderosas**: Permiten lógica compleja con service_role seguro
3. **Validación en capas**: RLS para seguridad básica, Edge Function para lógica de negocio
4. **Logs son cruciales**: Facilitan debugging en producción
5. **Patrón maestro funciona**: Siguiendo la estructura se evitan errores comunes

---

## 🆘 Soporte

Si encuentras problemas:

1. **Ver logs primero**:
   ```bash
   supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --follow
   ```

2. **Verificar variables**:
   - Dashboard > Edge Functions > Settings
   - Verificar que las 3 variables existen

3. **Test incremental**:
   - OPTIONS → POST sin auth → POST con auth
   - Identifica dónde falla

4. **Documentación oficial**:
   - https://supabase.com/docs/guides/functions

---

**Última actualización**: 2025-10-17
**Versión Edge Function**: 1.0.0
**Estado**: ✅ Lista para deployment
