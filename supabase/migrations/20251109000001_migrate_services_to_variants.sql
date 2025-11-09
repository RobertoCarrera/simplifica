-- Migration: Migrate existing services to variants system
-- Author: Roberto Carrera
-- Date: 2025-11-09
-- Description: Script to convert existing duplicate services into a base service with variants

-- =====================================================
-- MIGRATION SCRIPT FOR SERVICE VARIANTS
-- =====================================================

-- This script analyzes existing services and groups similar ones
-- into base services with variants.

-- Pattern detection:
-- - "Service Name - Level (period)" -> base: "Service Name", variant: "Level", billing: "period"
-- - "Service Name (period)" -> base: "Service Name", variant: "Standard", billing: "period"

DO $$
DECLARE
  v_service RECORD;
  v_base_service_id UUID;
  v_base_name TEXT;
  v_variant_name TEXT;
  v_billing_period TEXT;
  v_company_id UUID;
BEGIN
  RAISE NOTICE 'Starting service migration to variants system...';

  -- Loop through all services that match variant patterns
  FOR v_service IN 
    SELECT * FROM services 
    WHERE is_active = true 
    AND deleted_at IS NULL
    AND (
      name ILIKE '%mensual%' OR 
      name ILIKE '%anual%' OR
      name ILIKE '%monthly%' OR
      name ILIKE '%annually%' OR
      name ILIKE '%(anual)%' OR
      name ILIKE '%(mensual)%' OR
      name ILIKE '%esencial%' OR
      name ILIKE '%avanzado%' OR
      name ILIKE '%superior%' OR
      name ILIKE '%básico%' OR
      name ILIKE '%premium%'
    )
    ORDER BY name
  LOOP
    -- Extract base name, variant name, and billing period
    v_base_name := v_service.name;
    v_variant_name := 'Standard';
    v_billing_period := 'one-time';
    v_company_id := v_service.company_id;

    -- Pattern: "Name - Level (period)"
    IF v_service.name ~* '(.+)\s*-\s*(Esencial|Avanzado|Superior|Básico|Premium|Inicial)\s*\((mensual|anual)\)' THEN
      v_base_name := regexp_replace(v_service.name, '\s*-\s*(Esencial|Avanzado|Superior|Básico|Premium|Inicial)\s*\((mensual|anual)\)', '', 'i');
      v_variant_name := (regexp_matches(v_service.name, '-\s*(Esencial|Avanzado|Superior|Básico|Premium|Inicial)\s*\(', 'i'))[1];
      v_billing_period := CASE 
        WHEN v_service.name ~* 'mensual' THEN 'monthly'
        WHEN v_service.name ~* 'anual' THEN 'annually'
        ELSE 'one-time'
      END;

    -- Pattern: "Name (period)"
    ELSIF v_service.name ~* '(.+)\s*\((mensual|anual)\)' THEN
      v_base_name := regexp_replace(v_service.name, '\s*\((mensual|anual)\)', '', 'i');
      v_variant_name := 'Standard';
      v_billing_period := CASE 
        WHEN v_service.name ~* 'mensual' THEN 'monthly'
        WHEN v_service.name ~* 'anual' THEN 'annually'
        ELSE 'one-time'
      END;

    -- Pattern: "Name - Level"
    ELSIF v_service.name ~* '(.+)\s*-\s*(Esencial|Avanzado|Superior|Básico|Premium|Inicial)' THEN
      v_base_name := regexp_replace(v_service.name, '\s*-\s*(Esencial|Avanzado|Superior|Básico|Premium|Inicial)', '', 'i');
      v_variant_name := (regexp_matches(v_service.name, '-\s*(Esencial|Avanzado|Superior|Básico|Premium|Inicial)', 'i'))[1];
      v_billing_period := 'one-time';
    END IF;

    -- Clean up base name
    v_base_name := TRIM(v_base_name);
    v_variant_name := TRIM(INITCAP(v_variant_name));

    RAISE NOTICE 'Processing: % -> Base: %, Variant: %, Billing: %', 
      v_service.name, v_base_name, v_variant_name, v_billing_period;

    -- Find or create base service
    SELECT id INTO v_base_service_id
    FROM services
    WHERE name = v_base_name
    AND company_id = v_company_id
    AND has_variants = true
    LIMIT 1;

    -- If base service doesn't exist, create it or convert current service
    IF v_base_service_id IS NULL THEN
      -- Check if we should convert this service to be the base
      IF v_service.name = v_base_name THEN
        -- This IS the base service, just enable variants
        UPDATE services
        SET has_variants = true,
            base_features = jsonb_build_object(
              'description', description,
              'category', category
            )
        WHERE id = v_service.id;
        
        v_base_service_id := v_service.id;
        RAISE NOTICE '  -> Converted existing service to base service';
      ELSE
        -- Create new base service
        INSERT INTO services (
          name, 
          description, 
          company_id, 
          category,
          is_active,
          has_variants,
          base_features,
          tax_rate,
          unit_type,
          difficulty_level,
          can_be_remote,
          base_price,
          estimated_hours
        ) VALUES (
          v_base_name,
          'Servicio con múltiples variantes',
          v_company_id,
          v_service.category,
          true,
          true,
          jsonb_build_object(
            'description', v_service.description,
            'category', v_service.category
          ),
          v_service.tax_rate,
          v_service.unit_type,
          v_service.difficulty_level,
          v_service.can_be_remote,
          v_service.base_price,
          v_service.estimated_hours
        )
        RETURNING id INTO v_base_service_id;
        
        RAISE NOTICE '  -> Created new base service with ID: %', v_base_service_id;
      END IF;
    END IF;

    -- Create variant from original service
    INSERT INTO service_variants (
      service_id,
      variant_name,
      billing_period,
      base_price,
      estimated_hours,
      cost_price,
      profit_margin,
      discount_percentage,
      features,
      is_active,
      sort_order
    ) VALUES (
      v_base_service_id,
      v_variant_name,
      v_billing_period,
      v_service.base_price,
      v_service.estimated_hours,
      COALESCE(v_service.cost_price, 0),
      COALESCE(v_service.profit_margin, 30),
      CASE 
        WHEN v_billing_period = 'annually' THEN 16
        ELSE 0
      END,
      jsonb_build_object(
        'included', ARRAY[v_service.description],
        'excluded', ARRAY[]::text[],
        'limits', '{}'::jsonb
      ),
      true,
      CASE v_variant_name
        WHEN 'Esencial' THEN 1
        WHEN 'Básico' THEN 1
        WHEN 'Inicial' THEN 1
        WHEN 'Standard' THEN 2
        WHEN 'Avanzado' THEN 2
        WHEN 'Superior' THEN 3
        WHEN 'Premium' THEN 3
        ELSE 0
      END
    )
    ON CONFLICT (service_id, variant_name, billing_period) DO NOTHING;

    RAISE NOTICE '  -> Created variant: % - %', v_variant_name, v_billing_period;

    -- If this wasn't the base service, mark original as migrated (soft delete)
    IF v_service.id != v_base_service_id THEN
      UPDATE services
      SET deleted_at = now(),
          is_active = false,
          description = description || ' [MIGRADO A VARIANTE: ' || v_base_name || ' - ' || v_variant_name || ']'
      WHERE id = v_service.id;
      
      RAISE NOTICE '  -> Original service marked as migrated';
    END IF;

  END LOOP;

  RAISE NOTICE 'Migration completed successfully!';
END $$;

-- =====================================================
-- CREATE VIEW FOR EASY QUERYING
-- =====================================================

CREATE OR REPLACE VIEW service_variants_detailed AS
SELECT 
  s.id as service_id,
  s.name as service_name,
  s.description as service_description,
  s.company_id,
  s.category,
  s.has_variants,
  sv.id as variant_id,
  sv.variant_name,
  sv.billing_period,
  sv.base_price,
  sv.estimated_hours,
  sv.cost_price,
  sv.profit_margin,
  sv.discount_percentage,
  sv.features,
  sv.display_config,
  sv.is_active as variant_active,
  sv.sort_order,
  sv.created_at as variant_created_at
FROM services s
LEFT JOIN service_variants sv ON sv.service_id = s.id
WHERE s.is_active = true 
AND s.deleted_at IS NULL
ORDER BY s.name, sv.sort_order, sv.variant_name;

COMMENT ON VIEW service_variants_detailed IS 'Vista combinada de servicios y sus variantes para consultas fáciles';

-- Grant access
GRANT SELECT ON service_variants_detailed TO authenticated;
