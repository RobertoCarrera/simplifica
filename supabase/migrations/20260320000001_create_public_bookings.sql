-- Create public_bookings table (DMZ for public booking portal)
-- This table stores raw booking submissions before they are synced to the private bookings table

CREATE TABLE IF NOT EXISTS public.public_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_slug TEXT NOT NULL,
    booking_type_id UUID NOT NULL,
    professional_id UUID,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT,
    requested_date DATE NOT NULL,
    requested_time TIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'synced')),
    turnstile_verified BOOLEAN DEFAULT false,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT now(),
    synced_at TIMESTAMPTZ,
    CONSTRAINT uq_public_booking UNIQUE (company_slug, client_email, requested_date, requested_time)
);

-- RLS: service_role only (edge functions use service_role key)
ALTER TABLE public.public_bookings ENABLE ROW LEVEL SECURITY;
