-- ================================================
-- SISTEMA COMPLETO DE GESTIÓN DE TICKETS
-- ================================================
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Tabla de etapas/estados de tickets
CREATE TABLE IF NOT EXISTS stages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6B7280', -- Color hexadecimal
    order_position INTEGER NOT NULL DEFAULT 0,
    is_initial BOOLEAN DEFAULT FALSE, -- Es la etapa inicial
    is_final BOOLEAN DEFAULT FALSE, -- Es una etapa final
    is_active BOOLEAN DEFAULT TRUE,
    company_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla principal de tickets
CREATE TABLE IF NOT EXISTS tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Información básica
    title VARCHAR(255) NOT NULL,
    description TEXT,
    ticket_number VARCHAR(20) UNIQUE, -- Número secuencial único
    
    -- Relaciones
    company_id VARCHAR(50) NOT NULL,
    client_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES auth.users(id),
    created_by UUID REFERENCES auth.users(id),
    
    -- Estado y prioridad
    stage_id UUID REFERENCES stages(id),
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    status VARCHAR(20) DEFAULT 'open', -- open, in_progress, on_hold, resolved, closed
    
    -- Fechas importantes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    due_date TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Estimaciones y tiempo
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    
    -- Costos
    estimated_cost DECIMAL(10,2),
    final_cost DECIMAL(10,2),
    
    -- Información adicional
    tags TEXT[], -- Array de etiquetas
    custom_fields JSONB, -- Campos personalizados
    
    -- Para búsqueda
    search_vector TSVECTOR
);

-- 3. Tabla de servicios relacionados con tickets
CREATE TABLE IF NOT EXISTS ticket_services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    
    -- Información específica del servicio en este ticket
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2),
    total_price DECIMAL(10,2),
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    notes TEXT,
    
    -- Estado del servicio
    status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla de comentarios/actividad del ticket
CREATE TABLE IF NOT EXISTS ticket_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    
    content TEXT NOT NULL,
    comment_type VARCHAR(20) DEFAULT 'comment', -- comment, status_change, assignment, note
    
    -- Para cambios de estado
    old_value TEXT,
    new_value TEXT,
    field_changed VARCHAR(50),
    
    -- Metadata
    is_internal BOOLEAN DEFAULT FALSE, -- Solo visible para el equipo
    is_system BOOLEAN DEFAULT FALSE, -- Generado automáticamente
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabla de archivos adjuntos
CREATE TABLE IF NOT EXISTS ticket_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES auth.users(id),
    
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    -- Contexto
    attachment_type VARCHAR(50) DEFAULT 'general', -- general, evidence, invoice, contract
    description TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- ÍNDICES PARA PERFORMANCE
-- ================================================

CREATE INDEX IF NOT EXISTS idx_stages_company_id ON stages(company_id);
CREATE INDEX IF NOT EXISTS idx_stages_active ON stages(is_active);
CREATE INDEX IF NOT EXISTS idx_stages_order ON stages(order_position);

CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_stage_id ON tickets(stage_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_search ON tickets USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_ticket_services_ticket_id ON ticket_services(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_services_service_id ON ticket_services(service_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_created_at ON ticket_comments(created_at);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id);

-- ================================================
-- FUNCIONES AUXILIARES
-- ================================================

-- Función para generar número de ticket automático
CREATE OR REPLACE FUNCTION generate_ticket_number(p_company_id VARCHAR(50))
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
    next_number INTEGER;
    ticket_number VARCHAR(20);
BEGIN
    -- Obtener el siguiente número secuencial
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '[0-9]+') AS INTEGER)), 0) + 1
    INTO next_number
    FROM tickets
    WHERE company_id = p_company_id
    AND ticket_number ~ '^TK[0-9]+$';
    
    -- Generar el número con formato TK + número con padding
    ticket_number := 'TK' || LPAD(next_number::text, 6, '0');
    
    RETURN ticket_number;
END;
$$;

-- Función para actualizar el search_vector automáticamente
CREATE OR REPLACE FUNCTION update_ticket_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('spanish', 
        COALESCE(NEW.title, '') || ' ' ||
        COALESCE(NEW.description, '') || ' ' ||
        COALESCE(NEW.ticket_number, '') || ' ' ||
        COALESCE(array_to_string(NEW.tags, ' '), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- TRIGGERS
-- ================================================

-- Trigger para generar número de ticket automáticamente
CREATE OR REPLACE FUNCTION auto_generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := generate_ticket_number(NEW.company_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_ticket_number ON tickets;
CREATE TRIGGER trigger_auto_ticket_number
    BEFORE INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_ticket_number();

-- Trigger para search_vector
DROP TRIGGER IF EXISTS trigger_ticket_search_vector ON tickets;
CREATE TRIGGER trigger_ticket_search_vector
    BEFORE INSERT OR UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_search_vector();

-- Triggers para updated_at
DROP TRIGGER IF EXISTS trigger_tickets_updated_at ON tickets;
CREATE TRIGGER trigger_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_stages_updated_at ON stages;
CREATE TRIGGER trigger_stages_updated_at
    BEFORE UPDATE ON stages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_ticket_services_updated_at ON ticket_services;
CREATE TRIGGER trigger_ticket_services_updated_at
    BEFORE UPDATE ON ticket_services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- DATOS INICIALES
-- ================================================

-- Insertar etapas por defecto para company_id = '1'
INSERT INTO stages (name, description, color, order_position, is_initial, is_final, company_id)
SELECT * FROM (
    VALUES 
        ('Recibido', 'Ticket recién creado', '#3B82F6', 1, true, false, '1'),
        ('En Análisis', 'Analizando el problema', '#F59E0B', 2, false, false, '1'),
        ('En Progreso', 'Trabajando en la solución', '#10B981', 3, false, false, '1'),
        ('En Espera', 'Esperando información o piezas', '#F97316', 4, false, false, '1'),
        ('Listo para Entrega', 'Reparación completada', '#8B5CF6', 5, false, false, '1'),
        ('Entregado', 'Cliente ha recogido el dispositivo', '#059669', 6, false, true, '1'),
        ('Cancelado', 'Ticket cancelado', '#EF4444', 7, false, true, '1')
) AS v(name, description, color, order_position, is_initial, is_final, company_id)
WHERE NOT EXISTS (SELECT 1 FROM stages WHERE company_id = '1' LIMIT 1);

-- ================================================
-- VERIFICACIÓN FINAL
-- ================================================

-- Mostrar resumen de lo creado
SELECT 
    'stages' as table_name,
    COUNT(*) as records
FROM stages
WHERE company_id = '1'

UNION ALL

SELECT 
    'services' as table_name,
    COUNT(*) as records
FROM services
WHERE company_id = '1'

UNION ALL

SELECT 
    'tickets' as table_name,
    COUNT(*) as records
FROM tickets
WHERE company_id = '1';

-- Mostrar las etapas creadas
SELECT 
    name,
    description,
    color,
    order_position,
    is_initial,
    is_final
FROM stages 
WHERE company_id = '1'
ORDER BY order_position;
