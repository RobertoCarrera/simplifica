-- Fix 500 errors / statement timeouts (PostgreSQL error 57014)
-- Root cause: missing composite indexes causing full table scans

-- Fix 1: project_comments polling queries
-- Query pattern: project_id=eq.xxx&created_at=gt.xxx (HEAD requests)
CREATE INDEX IF NOT EXISTS idx_project_comments_project_id_created_at
    ON public.project_comments (project_id, created_at DESC);

-- Fix 2: services listing queries
-- Query pattern: company_id=eq.xxx&deleted_at=is.null ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_services_company_deleted_created
    ON public.services (company_id, created_at DESC)
    WHERE deleted_at IS NULL;
