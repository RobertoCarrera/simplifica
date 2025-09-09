-- =============================================
-- ACTUALIZACIÓN DE TABLA COMPANIES EXISTENTE
-- =============================================

-- Añadir columnas que faltan en la tabla companies existente
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'basic',
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Actualizar empresas existentes con valores por defecto
UPDATE companies 
SET 
    subscription_tier = COALESCE(subscription_tier, 'premium'),
    max_users = COALESCE(max_users, 50),
    is_active = COALESCE(is_active, true)
WHERE subscription_tier IS NULL OR max_users IS NULL OR is_active IS NULL;

-- Crear índices adicionales si no existen
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_companies_subscription_tier ON companies(subscription_tier);

-- Verificar que todas las empresas existentes tengan slug único
UPDATE companies 
SET slug = COALESCE(slug, LOWER(REPLACE(name, ' ', '-')) || '-' || EXTRACT(EPOCH FROM NOW())::TEXT)
WHERE slug IS NULL OR slug = '';

-- Asegurar que el slug es único
DO $$
DECLARE
    company_record RECORD;
    new_slug TEXT;
    counter INTEGER;
BEGIN
    FOR company_record IN 
        SELECT id, name, slug FROM companies 
        WHERE slug IN (
            SELECT slug FROM companies 
            GROUP BY slug 
            HAVING COUNT(*) > 1
        )
    LOOP
        counter := 1;
        new_slug := LOWER(REPLACE(company_record.name, ' ', '-'));
        
        WHILE EXISTS (SELECT 1 FROM companies WHERE slug = new_slug AND id != company_record.id) LOOP
            new_slug := LOWER(REPLACE(company_record.name, ' ', '-')) || '-' || counter;
            counter := counter + 1;
        END LOOP;
        
        UPDATE companies SET slug = new_slug WHERE id = company_record.id;
    END LOOP;
END $$;
