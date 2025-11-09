-- Migration: Create service variants system
-- Author: Roberto Carrera
-- Date: 2025-11-09
-- Description: Add support for service variants (tiers/levels and billing periods)

-- =====================================================
-- 1. CREATE service_variants TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.service_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  
  -- Variant identification
  variant_name text NOT NULL,
  billing_period text NOT NULL CHECK (billing_period IN ('one-time', 'monthly', 'annually', 'custom')),
  
  -- Pricing
  base_price numeric NOT NULL CHECK (base_price >= 0),
  estimated_hours numeric DEFAULT 0,
  cost_price numeric DEFAULT 0 CHECK (cost_price >= 0),
  profit_margin numeric DEFAULT 30.00 CHECK (profit_margin >= 0 AND profit_margin <= 100),
  discount_percentage numeric DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  
  -- Features and configuration
  features jsonb DEFAULT '{
    "included": [],
    "excluded": [],
    "limits": {}
  }'::jsonb,
  
  display_config jsonb DEFAULT '{
    "highlight": false,
    "badge": null,
    "color": null
  }'::jsonb,
  
  -- Status and ordering
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one variant per service/name/period combination
  CONSTRAINT unique_service_variant UNIQUE (service_id, variant_name, billing_period)
);

-- Index for faster queries
CREATE INDEX idx_service_variants_service_id ON public.service_variants(service_id);
CREATE INDEX idx_service_variants_active ON public.service_variants(service_id, is_active);

-- Comment on table
COMMENT ON TABLE public.service_variants IS 'Variantes de servicios: diferentes niveles (Esencial, Avanzado, Superior) y periodicidades (mensual, anual) de un mismo servicio base';

-- =====================================================
-- 2. MODIFY services TABLE
-- =====================================================

-- Add new columns to services table
ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS has_variants boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_features jsonb DEFAULT '{}'::jsonb;

-- Comment on new columns
COMMENT ON COLUMN public.services.has_variants IS 'Indica si el servicio tiene variantes. Si es false, se usa el precio base directamente.';
COMMENT ON COLUMN public.services.base_features IS 'Características comunes a todas las variantes del servicio';

-- =====================================================
-- 3. CREATE TRIGGERS
-- =====================================================

-- Trigger to update updated_at on service_variants
CREATE OR REPLACE FUNCTION update_service_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_service_variants_updated_at
  BEFORE UPDATE ON public.service_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_service_variants_updated_at();

-- =====================================================
-- 4. CREATE RLS POLICIES
-- =====================================================

-- Enable RLS on service_variants
ALTER TABLE public.service_variants ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view variants of services from their company
CREATE POLICY "Users can view service variants from their company"
  ON public.service_variants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_variants.service_id
      AND s.company_id IN (
        SELECT company_id FROM public.users
        WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Policy: Users can insert variants for services in their company
CREATE POLICY "Users can insert service variants in their company"
  ON public.service_variants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.services s
      INNER JOIN public.users u ON u.company_id = s.company_id
      WHERE s.id = service_variants.service_id
      AND u.auth_user_id = auth.uid()
    )
  );

-- Policy: Users can update variants of services from their company
CREATE POLICY "Users can update service variants from their company"
  ON public.service_variants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
      INNER JOIN public.users u ON u.company_id = s.company_id
      WHERE s.id = service_variants.service_id
      AND u.auth_user_id = auth.uid()
    )
  );

-- Policy: Users can delete variants of services from their company
CREATE POLICY "Users can delete service variants from their company"
  ON public.service_variants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
      INNER JOIN public.users u ON u.company_id = s.company_id
      WHERE s.id = service_variants.service_id
      AND u.auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- 5. CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to get service with all its variants
CREATE OR REPLACE FUNCTION get_service_with_variants(p_service_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'service', row_to_json(s.*),
    'variants', COALESCE(
      (
        SELECT jsonb_agg(row_to_json(sv.*) ORDER BY sv.sort_order, sv.variant_name, sv.billing_period)
        FROM service_variants sv
        WHERE sv.service_id = s.id
        AND sv.is_active = true
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM services s
  WHERE s.id = p_service_id;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_service_with_variants IS 'Obtiene un servicio con todas sus variantes activas';

-- Function to get all services with variants for a company
CREATE OR REPLACE FUNCTION get_company_services_with_variants(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'service', row_to_json(s.*),
      'variants', COALESCE(
        (
          SELECT jsonb_agg(row_to_json(sv.*) ORDER BY sv.sort_order, sv.variant_name, sv.billing_period)
          FROM service_variants sv
          WHERE sv.service_id = s.id
          AND sv.is_active = true
        ),
        '[]'::jsonb
      )
    )
  )
  INTO v_result
  FROM services s
  WHERE s.company_id = p_company_id
  AND s.is_active = true
  AND s.deleted_at IS NULL
  ORDER BY s.name;
  
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION get_company_services_with_variants IS 'Obtiene todos los servicios activos de una empresa con sus variantes';

-- Function to calculate annual price with discount
CREATE OR REPLACE FUNCTION calculate_annual_price(
  p_monthly_price numeric,
  p_discount_percentage numeric DEFAULT 16
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN ROUND((p_monthly_price * 12) * (1 - p_discount_percentage / 100), 2);
END;
$$;

COMMENT ON FUNCTION calculate_annual_price IS 'Calcula el precio anual aplicando un descuento al precio mensual';

-- =====================================================
-- 6. GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_variants TO authenticated;
GRANT EXECUTE ON FUNCTION get_service_with_variants TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_services_with_variants TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_annual_price TO authenticated;
