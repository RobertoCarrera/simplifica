# 🚀 Guía Rápida de Configuración - Presupuestos Invoiless

## ⚡ Pasos de Configuración (5 minutos)

### 1️⃣ Obtener API Key de Invoiless

1. **Crear cuenta** en [Invoiless](https://invoiless.com) (si no tienes)
2. **Login** en tu cuenta
3. Ir a **Settings** → **Integrations**
4. **Copiar** tu API Key (formato: `inv_xxxxxxxxxxxxx`)

### 2️⃣ Configurar en Desarrollo Local

**Archivo**: `src/environments/environment.ts`

```typescript
export const environment = {
  production: false,
  // ... otras configuraciones existentes
  
  // ⬇️ AGREGAR ESTA LÍNEA:
  invoilessApiKey: 'inv_TU_API_KEY_AQUI'  // ⚠️ Reemplazar con tu API Key real
};
```

### 3️⃣ Configurar en Producción (Vercel)

#### Opción A: Desde Vercel Dashboard

1. Abrir [Vercel Dashboard](https://vercel.com/dashboard)
2. Seleccionar tu proyecto **Simplifica**
3. Click en **Settings**
4. Click en **Environment Variables**
5. Click en **Add New**
6. Rellenar:
   ```
   Name: INVOILESS_API_KEY
   Value: inv_TU_API_KEY_AQUI
   Environment: Production, Preview, Development (marcar todos)
   ```
7. Click en **Save**
8. **Redeploy** tu aplicación (Settings → Deployments → Latest → Redeploy)

#### Opción B: Desde CLI de Vercel

```bash
# Instalar Vercel CLI (si no lo tienes)
npm i -g vercel

# Login en Vercel
vercel login

# Agregar variable de entorno
vercel env add INVOILESS_API_KEY

# Cuando te pregunte:
# - Value: inv_TU_API_KEY_AQUI
# - Environment: Production, Preview, Development (seleccionar todos)

# Redeploy
vercel --prod
```

### 4️⃣ Verificar Instalación

#### En Desarrollo:

```bash
# Terminal 1: Iniciar servidor
npm start

# Terminal 2: Abrir navegador
# Navegar a: http://localhost:4200/presupuestos

# ✅ Deberías ver:
# - Pantalla de presupuestos vacía (sin errores)
# - Botón "+ Nuevo Presupuesto" funcional
# - Sin errores en consola del navegador
```

#### En Producción:

```bash
# Abrir tu dominio de producción
https://simplifica.digitalizamostupyme.es/presupuestos

# ✅ Deberías ver la misma pantalla que en desarrollo
```

### 5️⃣ Crear Primer Presupuesto de Prueba

1. **Click** en "+ Nuevo Presupuesto"
2. **Rellenar datos del cliente**:
   ```
   Empresa: Empresa de Prueba SL
   Email: prueba@example.com
   Teléfono: 666 777 888
   ```
3. **Agregar concepto**:
   ```
   Nombre: Servicio de prueba
   Cantidad: 1
   Precio: 100.00
   IVA: 21.00
   ```
4. **Click** en "Guardar Presupuesto"
5. ✅ **Éxito**: Verás mensaje verde "Presupuesto creado correctamente"

## 🔍 Verificación de Configuración

### ✅ Checklist de Verificación

- [ ] API Key obtenida de Invoiless
- [ ] `environment.ts` actualizado con API Key
- [ ] Variable `INVOILESS_API_KEY` creada en Vercel
- [ ] Aplicación redeployada en Vercel
- [ ] Ruta `/presupuestos` accesible sin errores
- [ ] Modal de creación se abre correctamente
- [ ] Presupuesto de prueba creado exitosamente
- [ ] Email de envío funciona (opcional)

### ⚠️ Solución de Problemas Comunes

#### Problema: "Invoiless API Key no configurada"

**Causa**: API Key vacía o no configurada

**Solución**:
```typescript
// environment.ts - Verificar que NO esté vacía:
invoilessApiKey: ''  // ❌ MAL
invoilessApiKey: 'inv_abc123...'  // ✅ BIEN
```

#### Problema: Error 401 Unauthorized

**Causa**: API Key incorrecta

**Solución**:
1. Verificar que copiaste la API Key completa
2. Verificar que no tiene espacios al inicio/final
3. Regenerar API Key en Invoiless si es necesario

#### Problema: Error de CORS

**Causa**: Invoiless requiere HTTPS en producción

**Solución**:
- En desarrollo: No afecta (localhost permitido)
- En producción: Verificar que Vercel use HTTPS (por defecto lo hace)

#### Problema: No aparece en sidebar

**Causa**: Caché del navegador

**Solución**:
```bash
# Limpiar caché y recargar
Ctrl + Shift + R  (Windows/Linux)
Cmd + Shift + R   (Mac)
```

## 📊 Verificar en Invoiless Dashboard

1. **Login** en [Invoiless Dashboard](https://invoiless.com/login)
2. Ir a **Estimates** (Presupuestos)
3. ✅ Deberías ver tu presupuesto de prueba creado desde Simplifica
4. Verificar que datos coinciden:
   - Cliente
   - Conceptos
   - Total

## 🎯 Próximos Pasos

Una vez configurado:

1. **Crear presupuestos reales** para tus clientes
2. **Enviar por email** usando el botón 📧
3. **Gestionar estados** (Draft → Sent → Accepted)
4. **Integrar con tu flujo de trabajo** actual

## 📚 Recursos Adicionales

- [Documentación Invoiless API](https://docs.invoiless.com)
- [PRESUPUESTOS_README.md](./PRESUPUESTOS_README.md) - Documentación completa
- [Soporte Invoiless](https://invoiless.com/support)

## 💬 Soporte

Si tienes problemas:

1. Revisar consola del navegador (F12 → Console)
2. Revisar logs de Vercel (Dashboard → Deployments → Functions)
3. Verificar API Key en Invoiless Dashboard
4. Contactar soporte de Invoiless si persisten errores de API

---

**✅ Configuración completada - ¡Listo para usar!**
