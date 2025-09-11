-- ========================================
-- CONFIGURACIÓN DE SUPABASE AUTH PARA DESARROLLO
-- ========================================

-- Este script debe ejecutarse en el Dashboard de Supabase
-- en Authentication > Settings > Email Auth

/*
CONFIGURACIÓN RECOMENDADA PARA DESARROLLO:

1. En Supabase Dashboard > Authentication > Settings:

   Email Auth:
   - Enable email confirmations: DESACTIVADO (para desarrollo)
   - Enable email change confirmations: DESACTIVADO (para desarrollo) 
   - Enable secure email change: DESACTIVADO (para desarrollo)

2. Site URL:
   - Añadir: http://localhost:4200
   - Añadir: https://tu-dominio.com (para producción)

3. Redirect URLs:
   - Añadir: http://localhost:4200/auth/callback
   - Añadir: https://tu-dominio.com/auth/callback

4. JWT Settings:
   - JWT expiry: 3600 (1 hour)
   - Refresh token rotation: ACTIVADO

ALTERNATIVA VIA SQL (si tienes acceso directo):
*/

-- Verificar configuración actual de auth
SELECT 
    name,
    value
FROM auth.config
WHERE name IN (
    'SITE_URL',
    'URI_ALLOW_LIST', 
    'DISABLE_SIGNUP',
    'MAILER_SECURE_EMAIL_CHANGE_ENABLED',
    'MAILER_AUTOCONFIRM'
);

-- Para desarrollo, puedes temporalmente desactivar confirmación de email:
-- NOTA: Solo ejecutar en desarrollo, NO en producción
-- UPDATE auth.config SET value = 'true' WHERE name = 'MAILER_AUTOCONFIRM';

-- Verificar usuarios existentes y su estado de confirmación
SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    last_sign_in_at,
    confirmation_sent_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;
