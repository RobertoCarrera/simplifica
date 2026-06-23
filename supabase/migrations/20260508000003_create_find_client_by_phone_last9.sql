CREATE OR REPLACE FUNCTION find_client_by_phone_last9(p_company_id UUID, p_phone_last9 TEXT)
RETURNS TABLE(id UUID, company_id UUID, name TEXT, surname TEXT, email TEXT, phone TEXT, is_active boolean, deleted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.company_id, c.name, c.surname::TEXT, c.email, c.phone, c.is_active, c.deleted_at
  FROM clients c
  WHERE c.company_id = p_company_id
    AND c.deleted_at IS NULL
    AND c.phone IS NOT NULL
    AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '')) >= 9
    AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), 9) = p_phone_last9
  LIMIT 1;
END;
$$;