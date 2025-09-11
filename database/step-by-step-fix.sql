-- ========================================
-- CORRECCIÓN PASO A PASO - GESTIÓN DE EMPRESAS
-- ========================================

-- PASO 1: Crear tabla de invitaciones
CREATE TABLE IF NOT EXISTS public.company_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    responded_at TIMESTAMP WITH TIME ZONE NULL
);

-- Índices básicos
CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON public.company_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON public.company_invitations(email);

-- PASO 2: Habilitar RLS
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- PASO 3: Políticas básicas de RLS
CREATE POLICY "Company members can view invitations"
ON public.company_invitations
FOR SELECT
USING (
    company_id IN (
        SELECT company_id FROM public.users 
        WHERE auth_user_id = auth.uid() AND active = true
    )
);

-- PASO 4: Función simple para verificar empresas
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

-- PASO 5: Limpieza simple de duplicados
-- Identificar duplicados actuales
WITH duplicates AS (
    SELECT 
        name,
        id,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY created_at DESC) as rn
    FROM public.companies
    WHERE deleted_at IS NULL
)
SELECT 
    name,
    COUNT(*) as total,
    MAX(created_at) as newest_date,
    MIN(created_at) as oldest_date
FROM duplicates
GROUP BY LOWER(name)
HAVING COUNT(*) > 1;

-- Mostrar estado actual
SELECT 'SETUP PHASE 1 COMPLETED' as status;
SELECT 'Next: Apply full corrections manually' as next_step;
