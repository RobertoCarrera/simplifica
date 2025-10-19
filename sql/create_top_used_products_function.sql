-- SQL: create_top_used_products_function.sql
-- Purpose: Provide server-side computation of the most used products per company (default 3)
-- Returns product fields plus usage_count aggregated from ticket_products
-- SECURITY INVOKER to respect RLS

DO $$ BEGIN
  -- Helpful indexes for performance
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_ticket_products_company_product'
  ) THEN
    CREATE INDEX idx_ticket_products_company_product ON public.ticket_products(company_id, product_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_products_company_deleted'
  ) THEN
    CREATE INDEX idx_products_company_deleted ON public.products(company_id, deleted_at);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_top_used_products(target_company_id uuid, limit_count integer);

CREATE OR REPLACE FUNCTION public.get_top_used_products(
  target_company_id uuid,
  limit_count integer DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  price numeric,
  category text,
  brand text,
  model text,
  stock_quantity integer,
  usage_count bigint
)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT
    p.id,
    p.name,
    p.description,
    p.price,
    p.category,
    p.brand,
    p.model,
    COALESCE(p.stock_quantity, 0) AS stock_quantity,
    COALESCE(SUM(tp.quantity), 0) AS usage_count
  FROM public.products p
  LEFT JOIN public.ticket_products tp
    ON tp.product_id = p.id
    AND (tp.company_id = target_company_id OR tp.company_id IS NULL)
  WHERE p.deleted_at IS NULL
    AND (p.company_id = target_company_id OR p.company_id IS NULL)
  GROUP BY p.id, p.name, p.description, p.price, p.category, p.brand, p.model, p.stock_quantity
  ORDER BY usage_count DESC, p.name ASC
  LIMIT GREATEST(limit_count, 0)
$$;

COMMENT ON FUNCTION public.get_top_used_products(uuid, integer)
IS 'Return the top used products (by ticket_products.quantity) for a company, including global (company_id IS NULL) items.';
