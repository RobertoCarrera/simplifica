-- ============================================================
-- ARQUITECTURA: SUPABASE PÚBLICO (DMZ)
-- PROPÓSITO: Backend efímero para reservas de clientes finales
-- SEGURIDAD: Único punto público. RLS restrictivo. Sin Auth real.
-- ============================================================

-- 1. Tabla de reservas públicas (Efímera)
CREATE TABLE IF NOT EXISTS public.public_bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_slug TEXT NOT NULL,             -- El slug (ej: 'caibs')
    booking_type_id UUID NOT NULL,          -- El ID del servicio
    professional_id UUID,                   -- Opcional (auto-assign)
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT,
    requested_date DATE NOT NULL,
    requested_time TIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','expired','synced')),
    turnstile_verified BOOLEAN DEFAULT false,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT now(),
    synced_at TIMESTAMPTZ,                  -- ID temporal del sistema privado tras sync
    CONSTRAINT uq_public_booking UNIQUE (company_slug, client_email, requested_date, requested_time)
);

-- 2. Tabla de catálogo público (Copiado del privado)
CREATE TABLE IF NOT EXISTS public.booking_types_public (
    id UUID PRIMARY KEY,
    company_slug TEXT NOT NULL,
    name TEXT NOT NULL,
    duration_minutes INT NOT NULL,
    price DECIMAL(10,2),
    currency TEXT DEFAULT 'EUR',
    description TEXT,
    professional_names JSONB,              -- Ej: ["Ana", "Carlos"] No IDs
    available_days INT[] DEFAULT '{1,2,3,4,5}',
    slot_start TIME DEFAULT '09:00',
    slot_end TIME DEFAULT '18:00',
    slot_interval_minutes INT DEFAULT 30,
    active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Seguridad inicial (RLS)
ALTER TABLE public.public_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_types_public ENABLE ROW LEVEL SECURITY;

-- 4. Policies para ANON (El frontend lee catálogo pero NO reservas)
DROP POLICY IF EXISTS "Public can read active booking types" ON public.booking_types_public;
CREATE POLICY "Public can read active booking types"
ON public.booking_types_public FOR SELECT TO anon
USING (active = true);

-- Las reservas públicas no tienen policy INSERT para anon. 
-- Forzamos que pasen por la Edge Function (BFF) con booking_writer.

-- 5. Role de mínimo privilegio para la Edge Function
-- Nota: Ejecutar este bloque manualmente en el SQL Editor del proyecto público
-- CREATE ROLE booking_writer LOGIN PASSWORD 'TU-PASSWORD-SEGURO-AQUÍ';
-- GRANT USAGE ON SCHEMA public TO booking_writer;
-- GRANT INSERT ON public.public_bookings TO booking_writer;
-- GRANT SELECT ON public.public_bookings TO booking_writer; -- Necesario para check-conflicts
