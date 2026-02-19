-- Booking System Schema

-- 1. Integrations (Google Calendar Tokens)
CREATE TABLE public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('google_calendar')),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own integrations"
    ON public.integrations FOR ALL
    USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));


-- 2. Resources (Rooms, Equipment)
CREATE TABLE public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('room', 'equipment')),
    capacity INTEGER DEFAULT 1,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view resources"
    ON public.resources FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    ));

CREATE POLICY "Admins/Owners can manage resources"
    ON public.resources FOR ALL
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
    ));


-- 3. Booking Types (Services)
CREATE TABLE public.booking_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- specific professional
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL, -- minutes
    price DECIMAL(10, 2) DEFAULT 0,
    currency TEXT DEFAULT 'EUR',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, slug)
);

ALTER TABLE public.booking_types ENABLE ROW LEVEL SECURITY;

-- Public can view active booking types (for booking page) - Need to handle verify later via function or open policy
-- For now, authenticated users (e.g. the professional setting it up)
CREATE POLICY "Company members can view booking types"
    ON public.booking_types FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    ));
    
CREATE POLICY "Admins/Owners can manage booking types"
    ON public.booking_types FOR ALL
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
    ));


-- 4. Availability Schedules
CREATE TABLE public.availability_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    booking_type_id UUID REFERENCES public.booking_types(id) ON DELETE CASCADE, -- optional override
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_unavailable BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.availability_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own schedules"
    ON public.availability_schedules FOR ALL
    USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));
    

-- 5. Bookings
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    booking_type_id UUID REFERENCES public.booking_types(id) ON DELETE CASCADE NOT NULL,
    resource_id UUID REFERENCES public.resources(id),
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'pending', 'rescheduled')),
    google_event_id TEXT,
    meeting_link TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view bookings"
    ON public.bookings FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    ));

CREATE POLICY "Admins/Owners can manage bookings"
    ON public.bookings FOR ALL
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
    ));
