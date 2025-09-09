-- ============================================
-- INVITAR TU USUARIO REAL
-- ============================================

-- Ahora que sabemos que funciona, invitemos tu usuario real
SELECT 'INVITANDO TU USUARIO:' as info;
SELECT public.invite_user_to_company_debug(
    'puchu.carrera@gmail.com'::TEXT,
    'Puchu Carrera'::TEXT,
    'owner'::TEXT
) as invitation_result;

-- Verificar que se creó
SELECT 'TU USUARIO CREADO:' as info;
SELECT id, email, name, role, active, company_id
FROM public.users 
WHERE email = 'puchu.carrera@gmail.com';
