-- Migration: Migrate 'top-products' Edge Function to RPC
-- Priority: High (Performance Optimization)

-- Create the function to replace the Edge Function logic
CREATE OR REPLACE FUNCTION get_top_products(limit_count int DEFAULT 3)
RETURNS TABLE (
  product_id text,
  product_name text,
  total_quantity_sold numeric
)
LANGUAGE plpgsql
SECURITY DEFINER -- Use SECURITY DEFINER to ensure consistent access to tables, RLS is handled inside via auth.uid() lookup
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Get the company_id for the current authenticated user
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no tiene compañía asignada';
  END IF;

  RETURN QUERY
  SELECT
    -- Logic from Edge Function: use product_id if available, else 'name:' + name
    COALESCE(ii.product_id::text, 'name:' || COALESCE(ii.name, ii.description, 'Producto sin nombre')) as p_id,
    COALESCE(ii.name, ii.description, 'Producto sin nombre') as p_name,
    SUM(COALESCE(ii.quantity, 0)) as total_qty
  FROM
    invoice_items ii
  JOIN
    invoices i ON ii.invoice_id = i.id
  WHERE
    i.company_id = v_company_id
    AND i.status = 'paid'
  GROUP BY
    1, 2
  ORDER BY
    total_qty DESC
  LIMIT
    limit_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_top_products(int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_products(int) TO service_role;
