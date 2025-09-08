-- ================================================
-- SISTEMA COMPLETO DE GESTIÓN DE DISPOSITIVOS
-- ================================================

-- 1. Tabla de dispositivos
CREATE TABLE IF NOT EXISTS devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Información básica del dispositivo
    brand VARCHAR(100) NOT NULL, -- Marca (Apple, Samsung, HP, etc.)
    model VARCHAR(200) NOT NULL, -- Modelo específico
    device_type VARCHAR(50) NOT NULL, -- smartphone, laptop, tablet, desktop, printer, etc.
    serial_number VARCHAR(200), -- Número de serie
    imei VARCHAR(50), -- Para móviles
    
    -- Estado y condición
    status VARCHAR(50) NOT NULL DEFAULT 'received', -- received, in_progress, completed, delivered, cancelled
    condition_on_arrival TEXT, -- Estado al llegar (pantalla rota, no enciende, etc.)
    reported_issue TEXT NOT NULL, -- Problema reportado por el cliente
    
    -- Información técnica
    operating_system VARCHAR(100), -- iOS 16, Android 13, Windows 11, etc.
    storage_capacity VARCHAR(50), -- 128GB, 1TB, etc.
    color VARCHAR(50),
    purchase_date DATE,
    warranty_status VARCHAR(50), -- in_warranty, out_of_warranty, unknown
    
    -- Gestión interna
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    estimated_repair_time INTEGER, -- En horas
    actual_repair_time INTEGER, -- Tiempo real empleado
    
    -- Fechas importantes
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_repair_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    
    -- Costos y presupuesto
    estimated_cost DECIMAL(10,2),
    final_cost DECIMAL(10,2),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    
    -- Campos adicionales para IA futura
    ai_diagnosis JSONB, -- Diagnóstico automático
    ai_confidence_score DECIMAL(3,2), -- Confianza del diagnóstico IA
    device_images TEXT[], -- URLs de imágenes del dispositivo
    repair_notes TEXT[] -- Notas del proceso de reparación
);

-- 2. Tabla de historial de estados
CREATE TABLE IF NOT EXISTS device_status_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    
    -- Para tracking automático
    location VARCHAR(100), -- bench_1, storage, quality_check, etc.
    technician_notes TEXT
);

-- 3. Tabla de componentes/partes (para reparaciones detalladas)
CREATE TABLE IF NOT EXISTS device_components (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    component_name VARCHAR(100) NOT NULL, -- screen, battery, motherboard, etc.
    component_status VARCHAR(50) NOT NULL, -- working, damaged, replaced, not_checked
    replacement_needed BOOLEAN DEFAULT FALSE,
    replacement_cost DECIMAL(10,2),
    supplier VARCHAR(100),
    part_number VARCHAR(100),
    installed_at TIMESTAMP WITH TIME ZONE,
    warranty_months INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- 4. Tabla de imágenes/documentos del dispositivo
CREATE TABLE IF NOT EXISTS device_media (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    media_type VARCHAR(20) NOT NULL, -- image, video, document
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    -- Contexto de la imagen
    media_context VARCHAR(50), -- arrival, damage, repair_process, before_delivery, etc.
    description TEXT,
    taken_by UUID REFERENCES auth.users(id),
    taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Para IA
    ai_analysis JSONB, -- Análisis automático de la imagen
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Relación entre tickets y dispositivos
CREATE TABLE IF NOT EXISTS ticket_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    
    -- Relación específica
    relation_type VARCHAR(50) DEFAULT 'repair', -- repair, maintenance, diagnostic, pickup, delivery
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Progreso específico para este ticket
    progress_percentage INTEGER DEFAULT 0,
    current_task TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Única combinación por ticket-dispositivo-tipo
    UNIQUE(ticket_id, device_id, relation_type)
);

-- ================================================
-- ÍNDICES PARA PERFORMANCE
-- ================================================

CREATE INDEX IF NOT EXISTS idx_devices_company_id ON devices(company_id);
CREATE INDEX IF NOT EXISTS idx_devices_client_id ON devices(client_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_received_at ON devices(received_at);
CREATE INDEX IF NOT EXISTS idx_devices_brand_model ON devices(brand, model);

CREATE INDEX IF NOT EXISTS idx_device_status_history_device_id ON device_status_history(device_id);
CREATE INDEX IF NOT EXISTS idx_device_status_history_changed_at ON device_status_history(changed_at);

CREATE INDEX IF NOT EXISTS idx_device_components_device_id ON device_components(device_id);
CREATE INDEX IF NOT EXISTS idx_device_media_device_id ON device_media(device_id);
CREATE INDEX IF NOT EXISTS idx_ticket_devices_ticket_id ON ticket_devices(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_devices_device_id ON ticket_devices(device_id);

-- ================================================
-- TRIGGERS PARA AUTOMATIZACIÓN
-- ================================================

-- Trigger para actualizar updated_at en devices
CREATE OR REPLACE FUNCTION update_device_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_device_updated_at();

-- Trigger para registrar cambios de estado automáticamente
CREATE OR REPLACE FUNCTION log_device_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo registrar si el estado realmente cambió
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO device_status_history (
            device_id, 
            previous_status, 
            new_status, 
            changed_by,
            notes
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.created_by, -- O usar auth.uid() si está disponible
            CASE 
                WHEN NEW.status = 'in_progress' AND NEW.started_repair_at IS NULL THEN 
                    'Reparación iniciada automáticamente'
                WHEN NEW.status = 'completed' AND NEW.completed_at IS NULL THEN 
                    'Reparación completada automáticamente'
                WHEN NEW.status = 'delivered' AND NEW.delivered_at IS NULL THEN 
                    'Dispositivo entregado automáticamente'
                ELSE 'Cambio de estado automático'
            END
        );
        
        -- Actualizar fechas automáticamente
        IF NEW.status = 'in_progress' AND NEW.started_repair_at IS NULL THEN
            NEW.started_repair_at = NOW();
        ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
            NEW.completed_at = NOW();
        ELSIF NEW.status = 'delivered' AND NEW.delivered_at IS NULL THEN
            NEW.delivered_at = NOW();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_device_status_change
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION log_device_status_change();

-- ================================================
-- RLS (Row Level Security)
-- ================================================

-- Tabla de mapeo entre usuarios y empresas (necesaria para las políticas RLS)
CREATE TABLE IF NOT EXISTS user_companies (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- owner, admin, member, viewer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, company_id)
);

-- Índices para acelerar las comprobaciones en políticas RLS
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON user_companies(company_id);


-- Habilitar RLS en todas las tablas
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_devices ENABLE ROW LEVEL SECURITY;

-- Políticas para devices
CREATE POLICY "Users can view devices from their company" ON devices
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert devices for their company" ON devices
    FOR INSERT WITH CHECK (
        company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update devices from their company" ON devices
    FOR UPDATE USING (
        company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete devices from their company" ON devices
    FOR DELETE USING (
        company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )
    );

-- Políticas similares para las demás tablas
CREATE POLICY "Users can view device history from their company" ON device_status_history
    FOR SELECT USING (
        device_id IN (
            SELECT id FROM devices WHERE company_id IN (
                SELECT company_id FROM user_companies WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert device history for their company" ON device_status_history
    FOR INSERT WITH CHECK (
        device_id IN (
            SELECT id FROM devices WHERE company_id IN (
                SELECT company_id FROM user_companies WHERE user_id = auth.uid()
            )
        )
    );

-- Políticas para componentes
CREATE POLICY "Users can manage components from their company devices" ON device_components
    FOR ALL USING (
        device_id IN (
            SELECT id FROM devices WHERE company_id IN (
                SELECT company_id FROM user_companies WHERE user_id = auth.uid()
            )
        )
    );

-- Políticas para media
CREATE POLICY "Users can manage media from their company devices" ON device_media
    FOR ALL USING (
        device_id IN (
            SELECT id FROM devices WHERE company_id IN (
                SELECT company_id FROM user_companies WHERE user_id = auth.uid()
            )
        )
    );

-- Políticas para ticket_devices
CREATE POLICY "Users can manage ticket devices from their company" ON ticket_devices
    FOR ALL USING (
        ticket_id IN (
            SELECT id FROM tickets WHERE company_id IN (
                SELECT company_id FROM user_companies WHERE user_id = auth.uid()
            )
        )
    );

-- ================================================
-- FUNCIONES ÚTILES PARA EL FRONTEND
-- ================================================

-- Función para obtener el conteo de dispositivos por estado
CREATE OR REPLACE FUNCTION get_devices_stats(company_uuid UUID)
RETURNS TABLE (
    total_devices BIGINT,
    received_count BIGINT,
    in_progress_count BIGINT,
    completed_count BIGINT,
    delivered_count BIGINT,
    avg_repair_time NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE status = 'received') as received_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        AVG(actual_repair_time) as avg_repair_time
    FROM devices 
    WHERE company_id = company_uuid
    AND created_at >= NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener dispositivos con información del cliente
CREATE OR REPLACE FUNCTION get_devices_with_client_info(company_uuid UUID)
RETURNS TABLE (
    device_id UUID,
    brand VARCHAR,
    model VARCHAR,
    device_type VARCHAR,
    status VARCHAR,
    client_name VARCHAR,
    client_email VARCHAR,
    received_at TIMESTAMP WITH TIME ZONE,
    estimated_cost DECIMAL,
    progress_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as device_id,
        d.brand,
        d.model,
        d.device_type,
        d.status,
        c.name as client_name,
        c.email as client_email,
        d.received_at,
        d.estimated_cost,
        EXTRACT(DAY FROM NOW() - d.received_at)::INTEGER as progress_days
    FROM devices d
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.company_id = company_uuid
    ORDER BY d.received_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- DATOS DE EJEMPLO PARA TESTING
-- ================================================

-- Insertar algunos tipos de dispositivos comunes (solo si no existen)
INSERT INTO devices (
    company_id, 
    client_id, 
    brand, 
    model, 
    device_type, 
    reported_issue,
    condition_on_arrival,
    status,
    priority
) 
SELECT 
    c.id as company_id,
    cl.id as client_id,
    'Apple' as brand,
    'iPhone 14 Pro' as model,
    'smartphone' as device_type,
    'Pantalla rota después de caída' as reported_issue,
    'Pantalla completamente agrietada, funciona el táctil' as condition_on_arrival,
    'received' as status,
    'normal' as priority
FROM companies c
CROSS JOIN clients cl
WHERE c.name LIKE '%Test%' 
AND cl.name LIKE '%Test%'
LIMIT 1
ON CONFLICT DO NOTHING;

COMMENT ON TABLE devices IS 'Tabla principal para gestión completa de dispositivos en reparación';
COMMENT ON TABLE device_status_history IS 'Historial completo de cambios de estado de dispositivos';
COMMENT ON TABLE device_components IS 'Gestión detallada de componentes y partes de dispositivos';
COMMENT ON TABLE device_media IS 'Imágenes y documentos asociados a dispositivos';
COMMENT ON TABLE ticket_devices IS 'Relación entre tickets y dispositivos para workflow completo';
