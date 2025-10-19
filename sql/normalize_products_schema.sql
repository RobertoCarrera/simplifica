-- =====================================================
-- SQL Migration: Normalize Products Schema
-- =====================================================
-- Purpose: Create normalized tables for product brands and categories
--          to eliminate redundancy and enable advanced features
-- Created: 2025-10-19
-- =====================================================

-- =====================================================
-- 1. Create product_brands table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.product_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Unique constraint: brand name per company (or global if company_id IS NULL)
  CONSTRAINT unique_brand_per_company UNIQUE NULLS NOT DISTINCT (name, company_id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_product_brands_company ON public.product_brands(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_brands_name ON public.product_brands(name) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.product_brands IS 'Normalized table for product brands. Supports both global (company_id IS NULL) and company-specific brands.';
COMMENT ON COLUMN public.product_brands.company_id IS 'NULL for global brands, UUID for company-specific brands';

-- =====================================================
-- 2. Create product_categories table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  description TEXT,
  parent_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  icon TEXT, -- Font Awesome class or emoji
  color TEXT, -- Hex color for UI
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Unique constraint: category name per company (or global if company_id IS NULL)
  CONSTRAINT unique_category_per_company UNIQUE NULLS NOT DISTINCT (name, company_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_categories_company ON public.product_categories(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_categories_name ON public.product_categories(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON public.product_categories(parent_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.product_categories IS 'Normalized table for product categories with hierarchical support. Supports both global and company-specific categories.';
COMMENT ON COLUMN public.product_categories.parent_id IS 'Allows for subcategories (e.g., Hardware > RAM)';

-- =====================================================
-- 3. Migrate existing product data
-- =====================================================

-- Migrate brands (extract unique brands from products)
INSERT INTO public.product_brands (name, company_id, created_at, updated_at)
SELECT DISTINCT 
  p.brand,
  p.company_id,
  MIN(p.created_at) as created_at,
  NOW() as updated_at
FROM public.products p
WHERE p.brand IS NOT NULL 
  AND p.brand != ''
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.product_brands pb 
    WHERE pb.name = p.brand 
    AND (pb.company_id = p.company_id OR (pb.company_id IS NULL AND p.company_id IS NULL))
  )
GROUP BY p.brand, p.company_id
ON CONFLICT (name, company_id) DO NOTHING;

-- Migrate categories (extract unique categories from products)
INSERT INTO public.product_categories (name, company_id, created_at, updated_at)
SELECT DISTINCT 
  p.category,
  p.company_id,
  MIN(p.created_at) as created_at,
  NOW() as updated_at
FROM public.products p
WHERE p.category IS NOT NULL 
  AND p.category != ''
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.product_categories pc 
    WHERE pc.name = p.category 
    AND (pc.company_id = p.company_id OR (pc.company_id IS NULL AND p.company_id IS NULL))
  )
GROUP BY p.category, p.company_id
ON CONFLICT (name, company_id) DO NOTHING;

-- =====================================================
-- 4. Add new columns to products table
-- =====================================================

-- Add foreign keys to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.product_brands(id) ON DELETE SET NULL;

ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;

-- Create indexes for the new foreign keys
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id) WHERE deleted_at IS NULL;

-- =====================================================
-- 5. Populate foreign keys in products table
-- =====================================================

-- Link existing products to their brands
UPDATE public.products p
SET brand_id = pb.id
FROM public.product_brands pb
WHERE p.brand = pb.name
  AND (p.company_id = pb.company_id OR (p.company_id IS NULL AND pb.company_id IS NULL))
  AND p.brand IS NOT NULL
  AND p.brand != ''
  AND p.deleted_at IS NULL
  AND p.brand_id IS NULL;

-- Link existing products to their categories
UPDATE public.products p
SET category_id = pc.id
FROM public.product_categories pc
WHERE p.category = pc.name
  AND (p.company_id = pc.company_id OR (p.company_id IS NULL AND pc.company_id IS NULL))
  AND p.category IS NOT NULL
  AND p.category != ''
  AND p.deleted_at IS NULL
  AND p.category_id IS NULL;

-- =====================================================
-- 6. Create RLS policies
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Brands: Users can view global brands OR brands from their company
CREATE POLICY "Users can view accessible brands"
  ON public.product_brands
  FOR SELECT
  USING (
    company_id IS NULL  -- Global brands
    OR 
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Brands: Users can create brands for their company
CREATE POLICY "Users can create brands for their company"
  ON public.product_brands
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Brands: Users can update brands from their company
CREATE POLICY "Users can update their company brands"
  ON public.product_brands
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Categories: Users can view global categories OR categories from their company
CREATE POLICY "Users can view accessible categories"
  ON public.product_categories
  FOR SELECT
  USING (
    company_id IS NULL  -- Global categories
    OR 
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Categories: Users can create categories for their company
CREATE POLICY "Users can create categories for their company"
  ON public.product_categories
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Categories: Users can update categories from their company
CREATE POLICY "Users can update their company categories"
  ON public.product_categories
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 7. Create helper functions
-- =====================================================

-- Function to get or create a brand
CREATE OR REPLACE FUNCTION public.get_or_create_brand(
  p_brand_name TEXT,
  p_company_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_brand_id UUID;
BEGIN
  -- Try to find existing brand
  SELECT id INTO v_brand_id
  FROM public.product_brands
  WHERE name = p_brand_name
    AND (company_id = p_company_id OR company_id IS NULL)
    AND deleted_at IS NULL
  LIMIT 1;

  -- If not found, create it
  IF v_brand_id IS NULL THEN
    INSERT INTO public.product_brands (name, company_id)
    VALUES (p_brand_name, p_company_id)
    RETURNING id INTO v_brand_id;
  END IF;

  RETURN v_brand_id;
END;
$$;

-- Function to get or create a category
CREATE OR REPLACE FUNCTION public.get_or_create_category(
  p_category_name TEXT,
  p_company_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_id UUID;
BEGIN
  -- Try to find existing category
  SELECT id INTO v_category_id
  FROM public.product_categories
  WHERE name = p_category_name
    AND (company_id = p_company_id OR company_id IS NULL)
    AND deleted_at IS NULL
  LIMIT 1;

  -- If not found, create it
  IF v_category_id IS NULL THEN
    INSERT INTO public.product_categories (name, company_id)
    VALUES (p_category_name, p_company_id)
    RETURNING id INTO v_category_id;
  END IF;

  RETURN v_category_id;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_brand IS 'Helper function to get existing brand or create new one';
COMMENT ON FUNCTION public.get_or_create_category IS 'Helper function to get existing category or create new one';

-- =====================================================
-- 8. Update get_top_used_products function
-- =====================================================

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
  usage_count bigint,
  category_id uuid,
  brand_id uuid
)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT
    p.id,
    p.name,
    p.description,
    p.price,
    COALESCE(pc.name, p.category) AS category,
    COALESCE(pb.name, p.brand) AS brand,
    p.model,
    COALESCE(p.stock_quantity, 0) AS stock_quantity,
    COALESCE(SUM(tp.quantity), 0) AS usage_count,
    p.category_id,
    p.brand_id
  FROM public.products p
  LEFT JOIN public.ticket_products tp
    ON tp.product_id = p.id
    AND (tp.company_id = target_company_id OR tp.company_id IS NULL)
  LEFT JOIN public.product_categories pc ON p.category_id = pc.id
  LEFT JOIN public.product_brands pb ON p.brand_id = pb.id
  WHERE p.deleted_at IS NULL
    AND (p.company_id = target_company_id OR p.company_id IS NULL)
  GROUP BY p.id, p.name, p.description, p.price, p.category, p.brand, p.model, p.stock_quantity, p.category_id, p.brand_id, pc.name, pb.name
  ORDER BY usage_count DESC, p.name ASC
  LIMIT GREATEST(limit_count, 0)
$$;

COMMENT ON FUNCTION public.get_top_used_products(uuid, integer)
IS 'Return the top used products (by ticket_products.quantity) for a company with normalized brand and category names';

-- =====================================================
-- End of migration
-- =====================================================
