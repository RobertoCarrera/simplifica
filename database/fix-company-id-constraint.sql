-- ================================================
-- FIX COMPANY_ID CONSTRAINT ISSUE
-- ================================================
-- El error indica que company_id tiene NOT NULL constraint
-- pero nuestro código está intentando insertar NULL

-- 1. Verificar la estructura actual
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users'
AND column_name = 'company_id';

-- 2. Permitir NULL temporalmente en company_id (para casos edge)
ALTER TABLE public.users 
ALTER COLUMN company_id DROP NOT NULL;

-- 3. Verificar el cambio
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users'
AND column_name = 'company_id';

-- 4. Verificar datos existentes
SELECT 
    id,
    email,
    company_id,
    role,
    active
FROM public.users
ORDER BY created_at DESC
LIMIT 5;

-- Mensaje de confirmación
DO $$ 
BEGIN 
    RAISE NOTICE '✅ company_id constraint relaxed - NULL values now allowed';
    RAISE NOTICE '📝 Note: Consider making this mandatory later with proper logic';
END $$;
