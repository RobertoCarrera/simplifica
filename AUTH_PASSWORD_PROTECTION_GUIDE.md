# 🔐 Guía de Configuración: Auth Leaked Password Protection

## 📋 Resumen
**Warning**: `auth_leaked_password_protection`  
**Prioridad**: Alta  
**Tiempo estimado**: 1 minuto  
**Requiere**: Acceso a Supabase Dashboard

---

## ✅ Qué es Leaked Password Protection

Supabase Auth valida las contraseñas contra la base de datos de [HaveIBeenPwned.org](https://haveibeenpwned.com/), que contiene **más de 600 millones de contraseñas comprometidas** en violaciones de seguridad.

### Beneficios:
- ✅ Previene uso de contraseñas conocidas como comprometidas
- ✅ Protege cuentas de usuarios contra credential stuffing
- ✅ Cumplimiento con mejores prácticas de seguridad (OWASP)
- ✅ No afecta rendimiento (validación asíncrona)

---

## 🚀 Pasos para Activar

### 1. Acceder al Dashboard
```
https://supabase.com/dashboard/project/[TU-PROJECT-ID]
```

### 2. Navegar a Authentication
```
Sidebar izquierdo → Authentication → Policies
```

### 3. Activar Password Strength
En la sección **"Password Strength"**:
- ✅ **Minimum password length**: 8 (recomendado)
- ✅ **Leaked password protection**: **ENABLED** ← ACTIVAR ESTO

### 4. Guardar Cambios
Click en **"Save"** en la esquina superior derecha

---

## 🔍 Verificación

### Método 1: Probar en tu App
Intenta registrar un usuario con una contraseña conocida como comprometida:
```javascript
// Ejemplo de contraseña comprometida (NO usar en producción)
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'password123' // ❌ Debería rechazarse
})

if (error?.message.includes('password')) {
  console.log('✅ Leaked password protection funcionando')
}
```

### Método 2: Verificar en Dashboard
Volver a **Authentication → Policies** y confirmar:
- Estado: **Enabled** ✅
- Indicador verde activo

---

## 📊 Configuración Recomendada Completa

```yaml
Password Policies:
  ✅ Minimum password length: 8
  ✅ Require uppercase: true
  ✅ Require lowercase: true
  ✅ Require numbers: true
  ✅ Require special characters: false (opcional)
  ✅ Leaked password protection: ENABLED
  ✅ Password history: 3 (previene reutilización)
```

---

## ⚠️ Consideraciones

### Experiencia de Usuario
Cuando un usuario intenta usar una contraseña comprometida:
```json
{
  "error": {
    "message": "Password has been found in an online data breach. For account safety, please use a different password.",
    "status": 422
  }
}
```

### Mensaje Recomendado para UI
```html
<div class="error-message">
  ⚠️ Esta contraseña ha sido comprometida en violaciones de datos conocidas.
  Por tu seguridad, elige una contraseña diferente y única.
</div>
```

### Performance
- **Impacto**: Mínimo (~50-100ms adicional en registro)
- **Cache**: HaveIBeenPwned usa k-Anonymity (no envía contraseña completa)
- **Privacidad**: Solo se envían primeros 5 caracteres del hash SHA-1

---

## 🎯 Testing

### Contraseñas Conocidas como Comprometidas (para testing)
```
password123    ❌ Rechazada
qwerty123      ❌ Rechazada
admin123       ❌ Rechazada
letmein        ❌ Rechazada
welcome123     ❌ Rechazada
```

### Contraseñas Seguras (deberían aceptarse)
```
MyS3cur3P@ssw0rd2024!   ✅ Aceptada
Tr0picana#2024$Secure   ✅ Aceptada
Un1qu3P@ssw0rd!Today    ✅ Aceptada
```

---

## 📖 Recursos Adicionales

- [Documentación Supabase Auth](https://supabase.com/docs/guides/auth/password-security)
- [HaveIBeenPwned API](https://haveibeenpwned.com/API/v3)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

---

## ✅ Checklist Final

- [ ] Acceder a Supabase Dashboard
- [ ] Ir a Authentication → Policies
- [ ] Activar "Leaked password protection"
- [ ] Guardar cambios
- [ ] Probar con contraseña comprometida
- [ ] Verificar error correcto
- [ ] Actualizar UI con mensaje amigable
- [ ] Documentar en onboarding de usuarios

---

## 🎉 Resultado Esperado

```diff
Warnings de Seguridad:
- auth_leaked_password_protection: 1 → 0 ✅
```

**Tiempo total**: ~1 minuto de configuración  
**Beneficio**: Protección inmediata contra 600M+ contraseñas comprometidas
