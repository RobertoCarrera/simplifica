-- Script para añadir campos avanzados a la tabla services
-- Ejecutar en Supabase SQL Editor después de la migración de rename

-- Añadir campos para presupuestos e invoicing
DO $$
BEGIN
    -- Campos para presupuestos y facturación
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'tax_rate') THEN
        ALTER TABLE services ADD COLUMN tax_rate DECIMAL(5,2) DEFAULT 21.00;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'unit_type') THEN
        ALTER TABLE services ADD COLUMN unit_type VARCHAR(50) DEFAULT 'horas';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'min_quantity') THEN
        ALTER TABLE services ADD COLUMN min_quantity DECIMAL(10,2) DEFAULT 1.00;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'max_quantity') THEN
        ALTER TABLE services ADD COLUMN max_quantity DECIMAL(10,2);
    END IF;
    
    -- Campos para analíticas y métricas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'difficulty_level') THEN
        ALTER TABLE services ADD COLUMN difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level >= 1 AND difficulty_level <= 5);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'profit_margin') THEN
        ALTER TABLE services ADD COLUMN profit_margin DECIMAL(5,2) DEFAULT 30.00;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'cost_price') THEN
        ALTER TABLE services ADD COLUMN cost_price DECIMAL(10,2) DEFAULT 0.00;
    END IF;
    
    -- Campos adicionales para gestión
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'requires_parts') THEN
        ALTER TABLE services ADD COLUMN requires_parts BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'requires_diagnosis') THEN
        ALTER TABLE services ADD COLUMN requires_diagnosis BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'warranty_days') THEN
        ALTER TABLE services ADD COLUMN warranty_days INTEGER DEFAULT 30;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'skill_requirements') THEN
        ALTER TABLE services ADD COLUMN skill_requirements TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'tools_required') THEN
        ALTER TABLE services ADD COLUMN tools_required TEXT[];
    END IF;
    
    -- Campos para ubicación y disponibilidad
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'can_be_remote') THEN
        ALTER TABLE services ADD COLUMN can_be_remote BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'priority_level') THEN
        ALTER TABLE services ADD COLUMN priority_level INTEGER DEFAULT 3 CHECK (priority_level >= 1 AND priority_level <= 5);
    END IF;
    
    -- Índices para optimizar consultas
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'services' AND indexname = 'idx_services_category') THEN
        CREATE INDEX idx_services_category ON services(category);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'services' AND indexname = 'idx_services_difficulty') THEN
        CREATE INDEX idx_services_difficulty ON services(difficulty_level);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'services' AND indexname = 'idx_services_price_range') THEN
        CREATE INDEX idx_services_price_range ON services(base_price);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'services' AND indexname = 'idx_services_priority') THEN
        CREATE INDEX idx_services_priority ON services(priority_level);
    END IF;
END;
$$;

-- Crear tabla para gestión de categorías dinámicas
CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#6b7280', -- Hex color code
    icon VARCHAR(50) DEFAULT 'fas fa-cog',
    description TEXT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, company_id)
);

-- Índices para categorías
CREATE INDEX IF NOT EXISTS idx_service_categories_company ON service_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_active ON service_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_service_categories_sort ON service_categories(sort_order);

-- Insertar categorías por defecto para cada empresa
INSERT INTO service_categories (name, color, icon, description, company_id, sort_order)
SELECT 
    cat.name,
    cat.color,
    cat.icon,
    cat.description,
    c.id as company_id,
    cat.sort_order
FROM companies c,
(VALUES 
    ('Diagnóstico', '#3b82f6', 'fas fa-search', 'Servicios de diagnóstico y análisis', 1),
    ('Software', '#059669', 'fas fa-code', 'Instalación y configuración de software', 2),
    ('Mantenimiento', '#d97706', 'fas fa-tools', 'Mantenimiento preventivo y correctivo', 3),
    ('Datos', '#dc2626', 'fas fa-database', 'Recuperación y gestión de datos', 4),
    ('Seguridad', '#7c3aed', 'fas fa-shield-alt', 'Servicios de seguridad informática', 5),
    ('Hardware', '#f59e0b', 'fas fa-microchip', 'Reparación y actualización de hardware', 6),
    ('Redes', '#10b981', 'fas fa-network-wired', 'Configuración y mantenimiento de redes', 7),
    ('Formación', '#8b5cf6', 'fas fa-graduation-cap', 'Cursos y formación técnica', 8),
    ('Consultoría', '#06b6d4', 'fas fa-lightbulb', 'Asesoramiento técnico especializado', 9)
) as cat(name, color, icon, description, sort_order)
ON CONFLICT (name, company_id) DO NOTHING;

-- Verificar estructura actualizada
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'services' 
ORDER BY ordinal_position;
