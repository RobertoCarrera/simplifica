-- Function to get top used services based on ticket usage
-- Returns full service object so variants can be loaded by frontend
CREATE OR REPLACE FUNCTION get_top_used_services(target_company_id UUID, limit_count INT)
RETURNS SETOF services AS $$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM services s
  LEFT JOIN (
     SELECT service_id, COUNT(*) as usage_count
     FROM ticket_services
     GROUP BY service_id
  ) usage ON s.id = usage.service_id
  WHERE s.company_id = target_company_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  ORDER BY usage.usage_count DESC NULLS LAST, s.name ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
