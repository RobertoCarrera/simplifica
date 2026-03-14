-- Create domain_orders table for tracking purchase requests
CREATE TABLE IF NOT EXISTS public.domain_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed')) DEFAULT 'pending',
    payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    stripe_session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.domain_orders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own company orders"
    ON public.domain_orders
    FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "SuperAdmins can view all orders"
    ON public.domain_orders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'superadmin'
        )
    );

CREATE POLICY "Users can create orders for their company"
    ON public.domain_orders
    FOR INSERT
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "SuperAdmins can update orders"
    ON public.domain_orders
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'superadmin'
        )
    );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_domain_orders_company ON public.domain_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_domain_orders_status ON public.domain_orders(status);

-- Grant access to authenticated users
GRANT ALL ON public.domain_orders TO authenticated;
