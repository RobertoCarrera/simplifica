-- RPC: Get summary of professionals with unlinked bookings for a company
-- Returns professionals who have at least one booking with resource_id IS NULL (and not cancelled)
CREATE OR REPLACE FUNCTION get_unlinked_bookings_summary(p_company_id UUID)
RETURNS TABLE (
    professional_id UUID,
    display_name TEXT,
    default_resource_id UUID,
    unlinked_count BIGINT,
    has_resources BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p.id AS professional_id,
        p.display_name,
        p.default_resource_id,
        COUNT(b.id) AS unlinked_count,
        EXISTS (
            SELECT 1 FROM resources r
            WHERE r.company_id = p.company_id
              AND (r.type = 'room' OR r.type IS NULL)
              AND r.is_active = true
        ) AS has_resources
    FROM professionals p
    JOIN bookings b ON b.professional_id = p.id
    WHERE p.company_id = p_company_id
      AND b.resource_id IS NULL
      AND b.status != 'cancelled'
    GROUP BY p.id, p.display_name, p.default_resource_id, p.company_id
    HAVING COUNT(b.id) > 0
    ORDER BY p.display_name ASC;
$$;

GRANT EXECUTE ON FUNCTION get_unlinked_bookings_summary TO authenticated;
