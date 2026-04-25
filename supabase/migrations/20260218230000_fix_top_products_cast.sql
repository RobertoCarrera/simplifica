-- Fix for get_top_used_products RPC error 42804 (structure mismatch)
-- Explicitly cast all return columns to match the declared TABLE return type.

DROP FUNCTION IF EXISTS get_top_used_products(uuid, integer);

CREATE OR REPLACE FUNCTION get_top_used_products(target_company_id uuid, limit_count integer)
RETURNS TABLE(
    product_id uuid,
    usage_count bigint,
    name text,
    current_stock integer,
    price numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tp.product_id::uuid,
        COUNT(tp.product_id)::bigint AS usage_count,
        p.name::text,
        COALESCE(p.stock_quantity, 0)::integer AS current_stock,
        COALESCE(p.price, 0)::numeric
    FROM
        ticket_products tp
    JOIN
        products p ON tp.product_id = p.id
    JOIN
        tickets t ON tp.ticket_id = t.id
    WHERE
        t.company_id = target_company_id
        AND p.deleted_at IS NULL
    GROUP BY
        tp.product_id, p.name, p.stock_quantity, p.price
    ORDER BY
        usage_count DESC
    LIMIT
        limit_count;
END;
$$;