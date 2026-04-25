-- Fix for get_top_used_products RPC error 42703 (undefined column)
-- The error 42703 usually means a column reference in the query is ambiguous or missing.
-- This updated version uses explicit table aliases to avoid ambiguity.
-- AND we must DROP it properly first to change its return signature if it exists.

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
        tp.product_id,
        COUNT(tp.product_id) AS usage_count,
        p.name,
        p.stock_quantity AS current_stock,
        p.price
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
