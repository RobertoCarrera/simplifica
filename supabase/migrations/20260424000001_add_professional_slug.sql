-- Add slug column to professionals for pretty public booking URLs
-- Auto-generated from display_name, with collision handling via suffix

-- 1. Add slug column
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Create function to generate a URL-safe slug from any text
CREATE OR REPLACE FUNCTION public.slugify(text_to_slugify TEXT)
RETURNS TEXT AS $$
DECLARE
  slug TEXT;
BEGIN
  slug := lower(text_to_slugify);
  -- Replace spaces and common separators with hyphens
  slug := regexp_replace(slug, '[\s_]+', '-', 'g');
  -- Remove all non-alphanumeric characters except hyphens
  slug := regexp_replace(slug, '[^a-z0-9\-]', '', 'g');
  -- Collapse multiple hyphens into one
  slug := regexp_replace(slug, '\-+', '-', 'g');
  -- Remove leading/trailing hyphens
  slug := trim(BOTH '-' FROM slug);
  RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- 3. Create function to generate unique slug for a professional
-- Adds a short suffix (2 chars) if there's a collision within the same company
CREATE OR REPLACE FUNCTION public.generate_professional_slug(
  p_display_name TEXT,
  p_company_id UUID,
  p_existing_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  suffix TEXT := '';
  counter INTEGER := 0;
  max_attempts INTEGER := 100;
BEGIN
  -- Generate base slug from display name
  base_slug := public.slugify(p_display_name);

  -- If display name produces empty slug, use 'professional'
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'profesional';
  END IF;

  -- Try to find a unique slug within the company
  LOOP
    IF counter = 0 THEN
      final_slug := base_slug;
    ELSE
      -- Use first 2 chars of random substring as suffix for brevity
      final_slug := base_slug || '-' || substr(md5(random()::text), 1, 4);
    END IF;

    -- Check if slug already exists for this company (excluding current row if updating)
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals
      WHERE slug = final_slug
        AND company_id = p_company_id
        AND id IS DISTINCT FROM p_existing_id
    ) THEN
      RETURN final_slug;
    END IF;

    counter := counter + 1;
    IF counter >= max_attempts THEN
      -- As last resort, use UUID suffix (should never happen)
      final_slug := base_slug || '-' || substr(replace(p_existing_id::text, '-', ''), 1, 8);
      RETURN final_slug;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger function to auto-set slug on insert/update
CREATE OR REPLACE FUNCTION public.set_professional_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Only regenerate slug if display_name changed OR slug is null/empty
  IF TG_OP = 'INSERT' OR OLD.display_name IS DISTINCT FROM NEW.display_name OR NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_professional_slug(
      NEW.display_name,
      NEW.company_id,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger (fires on insert and when display_name changes)
DROP TRIGGER IF EXISTS trg_set_professional_slug ON public.professionals;
CREATE TRIGGER trg_set_professional_slug
  BEFORE INSERT OR UPDATE OF display_name ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_professional_slug();

-- 6. Backfill existing rows (those with null or empty slug)
UPDATE public.professionals
SET slug = public.generate_professional_slug(display_name, company_id, id)
WHERE slug IS NULL OR slug = '';

-- 7. Add unique index on slug (scoped to company)
-- This ensures slug+company_id is unique (the slug function already guarantees this)
CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_company_slug
  ON public.professionals (company_id, slug);

-- 8. Add index on slug alone for fast lookups
CREATE INDEX IF NOT EXISTS idx_professionals_slug ON public.professionals (slug);
