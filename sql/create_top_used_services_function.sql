-- SQL: create_top_used_services_function.sql
-- Purpose: Provide server-side computation of the most used services per company
-- Returns top N services (default 3) ordered by usage_count desc for the given company
-- Notes:
-- - SECURITY INVOKER so RLS still applies for callers
-- - Adds helpful indexes if missing

DO $$ BEGIN
  -- Helpful composite index for filtering by company and service
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_ticket_services_company_service'
  ) THEN
    CREATE INDEX idx_ticket_services_company_service ON public.ticket_services(company_id, service_id);
  END IF;

  -- Helpful index on services for company and active flag
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_services_company_active'
  ) THEN
    CREATE INDEX idx_services_company_active ON public.services(company_id, is_active);
  END IF;
END $$;

-- Drop and recreate function to be idempotent
DROP FUNCTION IF EXISTS public.get_top_used_services(target_company_id uuid, limit_count integer);

CREATE OR REPLACE FUNCTION public.get_top_used_services(
  target_company_id uuid,
  limit_count integer DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  name text,
  base_price numeric,
  estimated_hours numeric,
  category text,
  usage_count bigint
)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT
    s.id,
    s.name,
    s.base_price,
    s.estimated_hours,
    COALESCE(sc.name, s.category) AS category,
    COALESCE(SUM(ts.quantity), 0) AS usage_count
  FROM public.services s
  -- Try to resolve category UUID to a human-readable name; fall back to raw value
  LEFT JOIN public.service_categories sc
    ON sc.id::text = s.category::text
  LEFT JOIN public.ticket_services ts
    ON ts.service_id = s.id
    AND (ts.company_id = target_company_id OR ts.company_id IS NULL)
  WHERE s.is_active = TRUE
    AND (s.company_id = target_company_id OR s.company_id IS NULL)
  GROUP BY s.id, s.name, s.base_price, s.estimated_hours, COALESCE(sc.name, s.category)
  ORDER BY usage_count DESC, s.name ASC
  LIMIT GREATEST(limit_count, 0)
$$;

COMMENT ON FUNCTION public.get_top_used_services(uuid, integer)
IS 'Return the top used services (by ticket_services.quantity) for a company, fallback includes global services (company_id IS NULL).';
