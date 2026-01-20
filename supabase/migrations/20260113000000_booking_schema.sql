-- Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) NOT NULL,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON public.rooms
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable write access for authenticated users" ON public.rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON public.rooms
    FOR UPDATE
    TO authenticated
    USING (true);

-- Create google_calendar_configs
CREATE TABLE IF NOT EXISTS public.google_calendar_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
    calendar_id TEXT, -- Calendar ID to check for availability (busy times)
    calendar_id_booking TEXT, -- Calendar ID to insert new bookings into
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.google_calendar_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own calendar config" ON public.google_calendar_configs
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Add room_id to bookings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'room_id') THEN
        ALTER TABLE public.bookings ADD COLUMN room_id UUID REFERENCES public.rooms(id);
    END IF;
END $$;

-- Add room_required to services
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'room_required') THEN
        ALTER TABLE public.services ADD COLUMN room_required BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
