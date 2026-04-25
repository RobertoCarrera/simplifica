# Configuración de Seguridad y Login en Supabase

Para habilitar las funciones "Ultra Seguras" (Passkeys y Magic Links) en este proyecto, necesitas configurar tu proyecto de Supabase.

## 1. Habilitar Proveedores de Autenticación

Ve a **Authentication > Providers** en tu dashboard de Supabase.

### Email (Magic Links)
1.  Abre la configuración de **Email**.
2.  Asegúrate de que **Enable Email provider** esté activado.
3.  Desactiva **Confirm email** si quieres login inmediato sin verificación doble (opcional, pero recomendado dejar activado para seguridad).
    *   *Nota: Magic Link funciona independientemente de la confirmación de email para registro.*

### WebAuthn (Passkeys / Biometría)
1.  Ve a **Authentication > URL Configuration**.
2.  Asegúrate de que tu **Site URL** esté configurada correctamente (ej. `http://localhost:4200` para desarrollo, o tu dominio de producción `https://tu-app.com`).
3.  Añade las **Redirect URLs** necesarias:
    *   `http://localhost:4200/**`
    *   `https://tu-app.com/**`

*Nota: Native Passkeys se habilitan automáticamente con el proveedor de Email, pero requieren que el dominio (RP ID) coincida. En localhost funciona, pero en producción necesitas HTTPS y el dominio correcto.*

## 2. Configurar SMTP (Para Magic Links fiables)

Para que los Magic Links lleguen a la bandeja de entrada y no a spam, configura un servidor SMTP propio.

1.  Ve a **Project Settings > Authentication > SMTP Settings**.
2.  Activa **Enable Custom SMTP**.
3.  Ingresa los datos de tu proveedor (Resend, SendGrid, Amazon SES, o tu hosting corporativo):
    *   **Sender Email:** `auth@tuempresa.com`
    *   **Sender Name:** `Seguridad Simplifica`
    *   **Host:** `smtp.resend.com` (ejemplo)
    *   **Port:** `465` (SSL) o `587` (TLS)
    *   **User/Password:** Tus credenciales.

## 3. Plantillas de Email

Personaliza el correo de Magic Link para que se vea profesional.

1.  Ve a **Authentication > Email Templates > Magic Link**.
2.  **Subject:** `Ingresa a Simplifica ({{ .Token }})`
3.  **Body:**
    ```html
    <h2>Inicia sesión en Simplifica</h2>
    <p>Haz clic en el siguiente botón para acceder a tu panel de forma segura:</p>
    <p><a href="{{ .ConfirmationURL }}">Iniciar Sesión ahora</a></p>
    <p>O copia este enlace: {{ .ConfirmationURL }}</p>
    ```

## 4. Políticas de Seguridad (RLS)

Asegúrate de haber corrido los scripts de corrección RLS si tienes problemas de acceso:
*   `FIX_COMPANY_SETTINGS_RLS.sql` - Para corregir acceso a configuraciones.
*   `FIX_USUARIO_COMPLETO.sql` - Para corregir perfil de usuario.

---

### Solución de Problemas Comunes

**Error: "WebAuthn not supported"**
*   Asegúrate de estar usando una ventana segura (HTTPS o localhost).
*   El navegador debe soportar Passkeys (Chrome, Edge, Safari recientes).

**Error: "Rate limit exceeded"**
*   Supabase limita los emails a 3 por hora en el plan gratuito por defecto. Configura SMTP para evitar esto.

**Redirección incorrecta después del login**
*   Verifica la configuración de **Site URL** y **Redirect URLs** en el dashboard.
