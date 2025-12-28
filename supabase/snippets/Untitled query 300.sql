-- FIX: Crear usuario admin local vinculado a los datos de producción
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "auth"."users" (
    "instance_id", "id", "aud", "role", "email", "encrypted_password", 
    "email_confirmed_at", "raw_app_meta_data", "raw_user_meta_data", 
    "created_at", "updated_at", "is_super_admin"
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '84efaa41-9734-4410-b0f2-9101e225ce0c', -- Este ID coincide con tu usuario en public.users
    'authenticated', 'authenticated',
    'robertocarreratech@gmail.com',
    crypt('password', gen_salt('bf')),     -- Tu contraseña será: password
    now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), false
)
ON CONFLICT ("id") DO UPDATE SET
    "encrypted_password" = crypt('password', gen_salt('bf')),
    "email" = 'robertocarreratech@gmail.com',
    "email_confirmed_at" = now();

-- Asegurar que el usuario público está activo
UPDATE "public"."users" SET "active" = true WHERE "auth_user_id" = '84efaa41-9734-4410-b0f2-9101e225ce0c';
