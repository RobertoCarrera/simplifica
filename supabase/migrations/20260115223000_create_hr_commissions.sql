-- Create employee_commissions_config table
CREATE TABLE IF NOT EXISTS public.employee_commissions_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    commission_percentage NUMERIC(5,2) DEFAULT 0, -- e.g. 10.50
    fixed_amount NUMERIC(10,2) DEFAULT 0, -- e.g. 5.00
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, service_id)
);

-- Indexes for commissions config
CREATE INDEX idx_emp_comm_config_company ON public.employee_commissions_config(company_id);
CREATE INDEX idx_emp_comm_config_employee ON public.employee_commissions_config(employee_id);

-- RLS for Commissions Config
ALTER TABLE public.employee_commissions_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and Admins can manage commission configs"
    ON public.employee_commissions_config
    FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM public.company_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Employees can view own commission configs"
    ON public.employee_commissions_config
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM public.employees 
            WHERE user_id = auth.uid()
        )
    );

-- Create employee_productivity_logs table
-- This serves as an immutable log of work done and commissions earned
CREATE TABLE IF NOT EXISTS public.employee_productivity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL, -- Nullable if manual entry or booking deleted? Better set null
    service_name TEXT NOT NULL, -- Snapshot of service name
    service_price NUMERIC(10,2) NOT NULL, -- Snapshot of price charged
    calculated_commission NUMERIC(10,2) NOT NULL DEFAULT 0,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for logs
CREATE INDEX idx_prod_logs_company ON public.employee_productivity_logs(company_id);
CREATE INDEX idx_prod_logs_employee ON public.employee_productivity_logs(employee_id);
CREATE INDEX idx_prod_logs_date ON public.employee_productivity_logs(performed_at);

-- RLS for Productivity Logs
ALTER TABLE public.employee_productivity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and Admins can view all productivity logs"
    ON public.employee_productivity_logs
    FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM public.company_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Employees can view own productivity logs"
    ON public.employee_productivity_logs
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM public.employees 
            WHERE user_id = auth.uid()
        )
    );

-- Trigger to update updated_at on commissions config
CREATE TRIGGER update_employee_commissions_config_updated_at
    BEFORE UPDATE ON public.employee_commissions_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
