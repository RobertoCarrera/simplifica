-- ============================================================
-- RPC: get_clients_to_inactivate
-- Returns all active, non-deleted clients whose last
-- non-cancelled booking is older than `inactivity_days` days
-- (or who have never booked).
--
-- Uses LATERAL JOIN so the DB resolves the "last booking"
-- per client in a single execution plan instead of N+1
-- round-trips from the Edge Function.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_clients_to_inactivate(
  inactivity_days int DEFAULT 90
)
RETURNS TABLE (
  client_id   uuid,
  client_name text,
  company_id  uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id         AS client_id,
    c.name       AS client_name,
    c.company_id AS company_id
  FROM clients c
  LEFT JOIN LATERAL (
    SELECT b.start_time
    FROM bookings b
    WHERE b.client_id = c.id
      AND b.status <> 'cancelled'
    ORDER BY b.start_time DESC
    LIMIT 1
  ) lb ON true
  WHERE c.is_active = true
    AND c.deleted_at IS NULL
    AND (
      lb.start_time IS NULL
      OR lb.start_time < (now() - make_interval(days => inactivity_days))
    );
$$;

-- Grant execute to service_role (used by cron edge function)
GRANT EXECUTE ON FUNCTION public.get_clients_to_inactivate(int) TO service_role;
