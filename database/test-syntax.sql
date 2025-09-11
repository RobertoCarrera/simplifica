-- ========================================
-- TEST SIMPLE - VERIFICAR SINTAXIS
-- ========================================

-- Probar solo la función check_company_exists
CREATE OR REPLACE FUNCTION check_company_exists(p_company_name TEXT)
RETURNS TABLE(
    company_exists BOOLEAN,
    company_id UUID,
    company_name TEXT,
    owner_email TEXT,
    owner_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXISTS(SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(p_company_name)) as company_exists,
        c.id as company_id,
        c.name as company_name,
        u.email as owner_email,
        u.name as owner_name
    FROM public.companies c
    LEFT JOIN public.users u ON u.company_id = c.id AND u.role = 'owner' AND u.active = true
    WHERE LOWER(c.name) = LOWER(p_company_name)
    LIMIT 1;
END;
$$;

-- Probar la función
SELECT 'TEST FUNCTION CREATED' as status;
