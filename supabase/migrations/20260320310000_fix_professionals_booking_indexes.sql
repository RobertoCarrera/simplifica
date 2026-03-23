-- Migration: Add missing indexes for professionals / booking tables
-- Fixes PostgreSQL error 57014 (statement timeout) on:
--   GET /rest/v1/professionals?select=*,user:users(...),...
--   GET /rest/v1/services?select=id,name&is_bookable=eq.true&is_active=eq.true&deleted_at=is.null
--
-- Root cause: PostgREST expands nested selects into JOINs.
-- Without backing indexes the planner does sequential scans for every row,
-- which blows the statement_timeout on any non-trivial dataset.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. professionals ─ main filter + sort
--    Query pattern: company_id=eq.xxx  ORDER BY display_name
CREATE INDEX IF NOT EXISTS idx_professionals_company_display
    ON public.professionals (company_id, display_name);

-- 2. professionals ─ join to users
--    PostgREST translates  user:users(...)  as a JOIN on professionals.user_id = users.id
CREATE INDEX IF NOT EXISTS idx_professionals_user_id
    ON public.professionals (user_id)
    WHERE user_id IS NOT NULL;

-- 3. professional_services ─ join from professionals side
--    PostgREST: JOIN professional_services ON professional_id = professionals.id
CREATE INDEX IF NOT EXISTS idx_professional_services_professional_id
    ON public.professional_services (professional_id);

-- 4. professional_services ─ join to services (nested join)
--    PostgREST: JOIN services ON service_id = services.id
CREATE INDEX IF NOT EXISTS idx_professional_services_service_id
    ON public.professional_services (service_id);

-- 5. professional_schedules ─ join from professionals side (most expensive scan)
--    PostgREST: JOIN professional_schedules ON professional_id = professionals.id
--    Without this index PostgreSQL scans the WHOLE table for every professional row.
CREATE INDEX IF NOT EXISTS idx_professional_schedules_professional_id
    ON public.professional_schedules (professional_id);

-- 6. services ─ bookable listing (getBookableServices query)
--    Query pattern: company_id=eq.xxx & is_bookable=eq.true & is_active=eq.true & deleted_at IS NULL
--    The existing idx_services_company_deleted_created only covers (company_id, created_at DESC)
--    and does not cover the is_bookable / is_active filters, so the planner falls back to a scan.
CREATE INDEX IF NOT EXISTS idx_services_company_bookable_active
    ON public.services (company_id, is_bookable, is_active)
    WHERE deleted_at IS NULL;
