-- ========================================
-- ESQUEMA SQL PARA SUPABASE - MÓDULO CLIENTES
-- ========================================
-- Este archivo contiene el esquema necesario para crear las tablas
-- en Supabase para el módulo de gestión de clientes.



-- ========================================
-- 3. TABLA: localities (Localidades)
-- ========================================
CREATE TABLE IF NOT EXISTS public.localities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    
    name VARCHAR(100) NOT NULL,
    province VARCHAR(100),
    country VARCHAR(100) DEFAULT 'España',
    postal_code VARCHAR(10)
);

-- ========================================
-- 2. TABLA: addresses (Direcciones)
-- ========================================
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    
    direccion VARCHAR(255) NOT NULL,
    numero VARCHAR(10),
    piso VARCHAR(10),
    puerta VARCHAR(10),
    codigo_postal VARCHAR(10),
    
    -- Relaciones
    locality_id UUID REFERENCES public.localities(id),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ========================================
-- 1. TABLA: customers (Clientes)
-- ========================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    
    -- Información personal
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    dni VARCHAR(20) UNIQUE,
    fecha_nacimiento DATE,
    
    -- Información de contacto
    email VARCHAR(255) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    
    -- Información profesional
    profesion VARCHAR(100),
    empresa VARCHAR(100),
    
    -- Información adicional
    notas TEXT,
    activo BOOLEAN DEFAULT true,
    avatar_url TEXT,
    
    -- Relaciones
    direccion_id UUID REFERENCES public.addresses(id),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Índices para búsqueda
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('spanish', nombre || ' ' || apellidos || ' ' || COALESCE(email, '') || ' ' || COALESCE(dni, ''))
    ) STORED
);

-- ========================================
-- 4. ÍNDICES PARA OPTIMIZACIÓN
-- ========================================

-- Índice para búsqueda de texto completo en customers
CREATE INDEX IF NOT EXISTS customers_search_idx ON public.customers USING GIN (search_vector);

-- Índices para filtros comunes
CREATE INDEX IF NOT EXISTS customers_usuario_id_idx ON public.customers(usuario_id);
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers(email);
CREATE INDEX IF NOT EXISTS customers_dni_idx ON public.customers(dni);
CREATE INDEX IF NOT EXISTS customers_activo_idx ON public.customers(activo);
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON public.customers(created_at DESC);

-- Índices para addresses
CREATE INDEX IF NOT EXISTS addresses_usuario_id_idx ON public.addresses(usuario_id);
CREATE INDEX IF NOT EXISTS addresses_locality_id_idx ON public.addresses(locality_id);

-- Índices para localities
CREATE INDEX IF NOT EXISTS localities_name_idx ON public.localities(name);

-- ========================================
-- 5. TRIGGERS PARA UPDATED_AT
-- ========================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para customers
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para addresses
DROP TRIGGER IF EXISTS update_addresses_updated_at ON public.addresses;
CREATE TRIGGER update_addresses_updated_at
    BEFORE UPDATE ON public.addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ========================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 7. POLÍTICAS DE SEGURIDAD
-- ========================================

-- Políticas para customers
DROP POLICY IF EXISTS "Users can view own customers" ON public.customers;
CREATE POLICY "Users can view own customers" ON public.customers
    FOR SELECT USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can insert own customers" ON public.customers;
CREATE POLICY "Users can insert own customers" ON public.customers
    FOR INSERT WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can update own customers" ON public.customers;
CREATE POLICY "Users can update own customers" ON public.customers
    FOR UPDATE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can delete own customers" ON public.customers;
CREATE POLICY "Users can delete own customers" ON public.customers
    FOR DELETE USING (auth.uid() = usuario_id);

-- Políticas para addresses
DROP POLICY IF EXISTS "Users can view own addresses" ON public.addresses;
CREATE POLICY "Users can view own addresses" ON public.addresses
    FOR SELECT USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.addresses;
CREATE POLICY "Users can insert own addresses" ON public.addresses
    FOR INSERT WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can update own addresses" ON public.addresses;
CREATE POLICY "Users can update own addresses" ON public.addresses
    FOR UPDATE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.addresses;
CREATE POLICY "Users can delete own addresses" ON public.addresses
    FOR DELETE USING (auth.uid() = usuario_id);

-- Políticas para localities (solo lectura para todos)
DROP POLICY IF EXISTS "Anyone can view localities" ON public.localities;
CREATE POLICY "Anyone can view localities" ON public.localities
    FOR SELECT USING (true);

-- ========================================
-- 8. STORAGE PARA AVATARES
-- ========================================

-- Crear bucket para avatares de clientes
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-avatars', 'customer-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Política para subir avatares
DROP POLICY IF EXISTS "Users can upload customer avatars" ON storage.objects;
CREATE POLICY "Users can upload customer avatars" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'customer-avatars' AND
        auth.role() = 'authenticated'
    );

-- Política para ver avatares
DROP POLICY IF EXISTS "Anyone can view customer avatars" ON storage.objects;
CREATE POLICY "Anyone can view customer avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'customer-avatars');

-- Política para actualizar avatares
DROP POLICY IF EXISTS "Users can update customer avatars" ON storage.objects;
CREATE POLICY "Users can update customer avatars" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'customer-avatars' AND
        auth.role() = 'authenticated'
    );

-- Política para eliminar avatares
DROP POLICY IF EXISTS "Users can delete customer avatars" ON storage.objects;
CREATE POLICY "Users can delete customer avatars" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'customer-avatars' AND
        auth.role() = 'authenticated'
    );

-- ========================================
-- 9. DATOS DE EJEMPLO (LOCALIDADES ESPAÑOLAS)
-- ========================================

-- Insertar algunas localidades españolas comunes
INSERT INTO public.localities (name, province, country, postal_code) VALUES
('Madrid', 'Madrid', 'España', '28001'),
('Barcelona', 'Barcelona', 'España', '08001'),
('Valencia', 'Valencia', 'España', '46001'),
('Sevilla', 'Sevilla', 'España', '41001'),
('Zaragoza', 'Zaragoza', 'España', '50001'),
('Málaga', 'Málaga', 'España', '29001'),
('Murcia', 'Murcia', 'España', '30001'),
('Palma', 'Islas Baleares', 'España', '07001'),
('Las Palmas de Gran Canaria', 'Las Palmas', 'España', '35001'),
('Bilbao', 'Vizcaya', 'España', '48001'),
('Alicante', 'Alicante', 'España', '03001'),
('Córdoba', 'Córdoba', 'España', '14001'),
('Valladolid', 'Valladolid', 'España', '47001'),
('Vigo', 'Pontevedra', 'España', '36201'),
('Gijón', 'Asturias', 'España', '33201'),
('Hospitalet de Llobregat', 'Barcelona', 'España', '08901'),
('A Coruña', 'A Coruña', 'España', '15001'),
('Vitoria-Gasteiz', 'Álava', 'España', '01001'),
('Granada', 'Granada', 'España', '18001'),
('Elche', 'Alicante', 'España', '03201')
ON CONFLICT DO NOTHING;

-- ========================================
-- 10. FUNCIONES ÚTILES
-- ========================================

-- Función para buscar clientes por texto
CREATE OR REPLACE FUNCTION search_customers(search_term text, user_id uuid)
RETURNS TABLE (
    id uuid,
    nombre varchar,
    apellidos varchar,
    email varchar,
    telefono varchar,
    created_at timestamp with time zone,
    rank real
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.nombre,
        c.apellidos,
        c.email,
        c.telefono,
        c.created_at,
        ts_rank(c.search_vector, plainto_tsquery('spanish', search_term)) as rank
    FROM public.customers c
    WHERE 
        c.usuario_id = user_id AND
        c.search_vector @@ plainto_tsquery('spanish', search_term)
    ORDER BY rank DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener estadísticas de clientes
CREATE OR REPLACE FUNCTION get_customer_stats(user_id uuid)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', (SELECT COUNT(*) FROM public.customers WHERE usuario_id = user_id),
        'active_this_month', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE usuario_id = user_id 
            AND created_at >= date_trunc('month', CURRENT_DATE)
        ),
        'new_this_week', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE usuario_id = user_id 
            AND created_at >= date_trunc('week', CURRENT_DATE)
        ),
        'by_locality', (
            SELECT json_object_agg(l.name, customer_count)
            FROM (
                SELECT 
                    COALESCE(l.name, 'Sin localidad') as name,
                    COUNT(c.id) as customer_count
                FROM public.customers c
                LEFT JOIN public.addresses a ON c.direccion_id = a.id
                LEFT JOIN public.localities l ON a.locality_id = l.id
                WHERE c.usuario_id = user_id
                GROUP BY l.name
            ) l
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- INSTRUCCIONES DE IMPLEMENTACIÓN
-- ========================================

/*
PASOS PARA IMPLEMENTAR EN SUPABASE:

1. Ve a tu panel de Supabase (https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a "SQL Editor"
4. Copia y pega este script completo
5. Ejecuta el script haciendo clic en "Run"

VERIFICACIÓN:
- Ve a "Table Editor" para verificar que las tablas se crearon
- Ve a "Authentication" para verificar que RLS está habilitado
- Ve a "Storage" para verificar que el bucket se creó

CONFIGURACIÓN ADICIONAL:
- En "Settings" → "API", copia tu URL y anon key
- Actualiza el archivo environment.ts con tus credenciales reales

PRUEBAS:
- La aplicación debería conectar automáticamente
- Puedes crear, editar y eliminar clientes
- Los avatares se subirán al storage de Supabase
- La búsqueda funcionará con texto completo en español
*/
