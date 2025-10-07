-- ================================================================
-- AÑADIR company_id A TABLAS QUE LO NECESITAN
-- ================================================================
-- Este script añade la columna company_id a tablas que la necesitan
-- para multi-tenancy correcto
-- 
-- EJECUTAR ESTE SCRIPT **ANTES** DE ENABLE_RLS_ALL_TABLES.sql
-- ================================================================

BEGIN;

-- ================================================================
-- 1. TICKET_STAGES - Necesita company_id
-- ================================================================
-- Los stages de tickets deben ser específicos por empresa

ALTER TABLE IF EXISTS public.ticket_stages 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Migrar datos existentes: asignar company_id basado en usuarios existentes
UPDATE public.ticket_stages ts
SET company_id = (
    SELECT u.company_id 
    FROM public.users u 
    LIMIT 1
)
WHERE ts.company_id IS NULL;

-- Hacer NOT NULL después de migrar
ALTER TABLE public.ticket_stages 
    ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_stages_company 
    ON public.ticket_stages(company_id);

-- ================================================================
-- 2. TICKET_TAGS - Necesita company_id
-- ================================================================
-- Los tags de tickets deben ser específicos por empresa

ALTER TABLE IF EXISTS public.ticket_tags 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Migrar datos existentes
UPDATE public.ticket_tags tt
SET company_id = (
    SELECT u.company_id 
    FROM public.users u 
    LIMIT 1
)
WHERE tt.company_id IS NULL;

ALTER TABLE public.ticket_tags 
    ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_tags_company 
    ON public.ticket_tags(company_id);

-- ================================================================
-- 3. PRODUCTS - Necesita company_id
-- ================================================================
-- Los productos deben ser específicos por empresa

ALTER TABLE IF EXISTS public.products 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Migrar datos existentes
UPDATE public.products p
SET company_id = (
    SELECT u.company_id 
    FROM public.users u 
    LIMIT 1
)
WHERE p.company_id IS NULL;

ALTER TABLE public.products 
    ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_company 
    ON public.products(company_id);

-- ================================================================
-- 4. JOB_NOTES - Necesita company_id (si existe)
-- ================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_notes') THEN
        -- Añadir columna si no existe
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'job_notes' AND column_name = 'company_id'
        ) THEN
            ALTER TABLE public.job_notes 
                ADD COLUMN company_id UUID REFERENCES public.companies(id);
            
            -- Migrar datos existentes
            UPDATE public.job_notes jn
            SET company_id = (
                SELECT u.company_id 
                FROM public.users u 
                LIMIT 1
            )
            WHERE jn.company_id IS NULL;
            
            ALTER TABLE public.job_notes 
                ALTER COLUMN company_id SET NOT NULL;
            
            CREATE INDEX idx_job_notes_company 
                ON public.job_notes(company_id);
        END IF;
    END IF;
END $$;

-- ================================================================
-- 5. PENDING_USERS - Necesita company_id
-- ================================================================
-- Los usuarios pendientes deben estar asociados a una empresa

ALTER TABLE IF EXISTS public.pending_users 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Migrar datos existentes: dejar NULL permitido porque algunos pending users
-- pueden no tener empresa asignada aún

CREATE INDEX IF NOT EXISTS idx_pending_users_company 
    ON public.pending_users(company_id) WHERE company_id IS NOT NULL;

-- ================================================================
-- VERIFICACIÓN
-- ================================================================

-- Mostrar tablas que ahora tienen company_id
SELECT 
    '✅ COLUMNA company_id AÑADIDA' AS resultado,
    table_name,
    column_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND column_name = 'company_id'
    AND table_name IN ('ticket_stages', 'ticket_tags', 'products', 'job_notes', 'pending_users')
ORDER BY table_name;

COMMIT;

-- ================================================================
-- RESULTADO
-- ================================================================
-- ✅ ticket_stages ahora tiene company_id
-- ✅ ticket_tags ahora tiene company_id
-- ✅ products ahora tiene company_id
-- ✅ job_notes ahora tiene company_id (si existe)
-- ✅ pending_users ahora tiene company_id (nullable)
-- ================================================================

SELECT '✅ Columnas company_id añadidas exitosamente' AS resultado;
SELECT '➡️  Ahora puedes ejecutar ENABLE_RLS_ALL_TABLES.sql' AS siguiente_paso;
