-- FIX COMPLETO: Crear empresa, usuario y membresía para Roberto
-- Ejecuta esto en Supabase Dashboard > SQL Editor

DO $$
DECLARE
  v_auth_user_id UUID;
  v_public_user_id UUID;
  v_company_id UUID;
  v_super_admin_role_id UUID;
  v_owner_role_id UUID;
BEGIN
  -- 1. Obtener el ID del usuario de auth.users
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = 'robertocarreratech@gmail.com';
  
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no existe en auth.users. Primero debes registrarte.';
  END IF;
  
  RAISE NOTICE 'Auth User ID: %', v_auth_user_id;
  
  -- 2. Obtener IDs de roles
  SELECT id INTO v_super_admin_role_id FROM public.app_roles WHERE name = 'super_admin';
  SELECT id INTO v_owner_role_id FROM public.app_roles WHERE name = 'owner';
  
  RAISE NOTICE 'Super Admin Role ID: %', v_super_admin_role_id;
  RAISE NOTICE 'Owner Role ID: %', v_owner_role_id;
  
  -- 3. Crear la empresa si no existe
  INSERT INTO public.companies (id, name, slug, nif, is_active, created_at)
  VALUES (
    gen_random_uuid(),
    'Simplifica',
    'simplifica',
    'B12345678',
    true,
    now()
  )
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_company_id;
  
  -- Si ya existía, obtener el ID
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies WHERE slug = 'simplifica';
  END IF;
  
  RAISE NOTICE 'Company ID: %', v_company_id;
  
  -- 4. Crear el usuario en public.users
  INSERT INTO public.users (
    id,
    auth_user_id,
    email,
    name,
    surname,
    app_role_id,
    company_id,
    active,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_auth_user_id,
    'robertocarreratech@gmail.com',
    'Roberto',
    'Carrera',
    v_super_admin_role_id,
    v_company_id,
    true,
    now()
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    app_role_id = EXCLUDED.app_role_id,
    company_id = EXCLUDED.company_id,
    active = true
  RETURNING id INTO v_public_user_id;
  
  -- Si ya existía, obtener el ID
  IF v_public_user_id IS NULL THEN
    SELECT id INTO v_public_user_id FROM public.users WHERE auth_user_id = v_auth_user_id;
  END IF;
  
  RAISE NOTICE 'Public User ID: %', v_public_user_id;
  
  -- 5. Crear la membresía en company_members
  INSERT INTO public.company_members (
    id,
    user_id,
    company_id,
    role_id,
    role,
    status,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_public_user_id,
    v_company_id,
    v_owner_role_id,
    'owner',
    'active',
    now()
  )
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role_id = EXCLUDED.role_id,
    role = EXCLUDED.role,
    status = 'active';
  
  RAISE NOTICE '✅ Configuración completada exitosamente!';
  RAISE NOTICE 'Usuario: robertocarreratech@gmail.com';
  RAISE NOTICE 'Empresa: Simplifica';
  RAISE NOTICE 'Rol Global: super_admin';
  RAISE NOTICE 'Rol en Empresa: owner';
  
END $$;

-- Verificar que todo quedó bien
SELECT 'VERIFICACIÓN' as check_type;

SELECT 'USUARIO' as tipo, u.id, u.email, u.name, ar.name as global_role, c.name as company
FROM public.users u
LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.email = 'robertocarreratech@gmail.com';

SELECT 'MEMBRESÍA' as tipo, cm.id, cm.status, ar.name as role, c.name as company
FROM public.company_members cm
LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
LEFT JOIN public.companies c ON cm.company_id = c.id
WHERE cm.user_id IN (SELECT id FROM public.users WHERE email = 'robertocarreratech@gmail.com');
