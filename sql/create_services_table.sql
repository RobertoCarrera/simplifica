-- Script SQL para crear la tabla de servicios en Supabase
-- Ejecutar este script en el SQL Editor de Supabase

-- Crear la tabla services si no existe
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) DEFAULT 0,
  estimated_hours DECIMAL(4,2) DEFAULT 0,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  company_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_services_company_id ON services(company_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);

-- Crear función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Crear trigger para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insertar datos de ejemplo (solo si la tabla está vacía)
INSERT INTO services (name, description, base_price, estimated_hours, category, company_id)
SELECT * FROM (
  VALUES 
    ('Diagnóstico de Hardware', 'Análisis completo del estado del hardware del equipo', 25.00, 0.5, 'Diagnóstico', '1'),
    ('Instalación de Sistema Operativo', 'Instalación limpia de Windows/Linux con drivers básicos', 45.00, 2.0, 'Software', '1'),
    ('Limpieza Profunda', 'Limpieza física completa del equipo, cambio de pasta térmica', 30.00, 1.0, 'Mantenimiento', '1'),
    ('Recuperación de Datos', 'Recuperación de archivos de discos dañados o formateados', 80.00, 3.0, 'Datos', '1'),
    ('Eliminación de Virus', 'Análisis y eliminación completa de malware y virus', 35.00, 1.5, 'Seguridad', '1'),
    ('Actualización de Hardware', 'Instalación y configuración de componentes nuevos', 40.00, 1.5, 'Hardware', '1'),
    ('Configuración de Red', 'Configuración de conexiones de red y compartición', 30.00, 1.0, 'Redes', '1'),
    ('Backup y Restauración', 'Copia de seguridad y restauración de datos', 50.00, 2.0, 'Datos', '1'),
    ('Optimización del Sistema', 'Limpieza y optimización del rendimiento del sistema', 35.00, 1.5, 'Mantenimiento', '1'),
    ('Reparación de Pantalla', 'Cambio de pantalla LCD/LED en portátiles', 60.00, 2.5, 'Hardware', '1')
) AS v(name, description, base_price, estimated_hours, category, company_id)
WHERE NOT EXISTS (SELECT 1 FROM services LIMIT 1);

-- Verificar que los datos se insertaron correctamente
SELECT 
  COUNT(*) as total_services,
  COUNT(CASE WHEN is_active THEN 1 END) as active_services,
  AVG(base_price) as avg_price,
  AVG(estimated_hours) as avg_hours
FROM services
WHERE company_id = '1';

-- Mostrar todos los servicios creados
SELECT 
  id,
  name,
  category,
  base_price,
  estimated_hours,
  is_active,
  created_at
FROM services 
WHERE company_id = '1'
ORDER BY category, name;
