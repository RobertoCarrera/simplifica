-- Add booking_type and resource_id to bookings
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'service', -- 'service', 'block'
ADD COLUMN IF NOT EXISTS resource_id UUID; -- For future resource linking

-- Create resources table for future use (foundation)
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'room', 'equipment'
    qty INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for resources
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resources are viewable by company members" ON public.resources
    FOR SELECT USING (
        company_id IN (
            SELECT cm.company_id
            FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Resources are editable by company admins" ON public.resources
    FOR ALL USING (
        EXISTS (
            SELECT 1 
            FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid()
            AND cm.company_id = public.resources.company_id
            AND cm.role IN ('owner', 'admin')
        )
    );
