-- Booking System Refactor Migration
-- Adds booking capabilities to services and creates professionals management

-- 1. Add booking fields to services table
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_bookable BOOLEAN DEFAULT false;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 0;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS booking_color TEXT;

-- 2. Create professionals table
CREATE TABLE IF NOT EXISTS public.professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    display_name TEXT NOT NULL,
    title TEXT,
    bio TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, company_id)
);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view professionals"
    ON public.professionals FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    ));

CREATE POLICY "Admins/Owners can manage professionals"
    ON public.professionals FOR ALL
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
    ));

-- 3. Create professional_services junction table
CREATE TABLE IF NOT EXISTS public.professional_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(professional_id, service_id)
);

ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view professional_services"
    ON public.professional_services FOR SELECT
    USING (professional_id IN (
        SELECT id FROM public.professionals WHERE company_id IN (
            SELECT company_id FROM public.company_members 
            WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    ));

CREATE POLICY "Admins/Owners can manage professional_services"
    ON public.professional_services FOR ALL
    USING (professional_id IN (
        SELECT id FROM public.professionals WHERE company_id IN (
            SELECT company_id FROM public.company_members 
            WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    ));

-- 4. Update bookings table to reference service and professional instead of booking_type
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id);

-- Note: We keep booking_type_id for now to avoid breaking existing data. 
-- It can be dropped in a future migration after confirming no production data uses it.

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_professionals_company ON public.professionals(company_id);
CREATE INDEX IF NOT EXISTS idx_professionals_user ON public.professionals(user_id);
CREATE INDEX IF NOT EXISTS idx_professional_services_professional ON public.professional_services(professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_services_service ON public.professional_services(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON public.bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_professional ON public.bookings(professional_id);
CREATE INDEX IF NOT EXISTS idx_services_is_bookable ON public.services(is_bookable) WHERE is_bookable = true;
