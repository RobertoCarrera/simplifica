-- Migration: Create HR Module (Employees & Documents)

-- 1. Create employees table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE SET NULL, -- Link to existing user if any
    
    -- Personal & Fiscal Data
    nif VARCHAR(20),
    social_security_number VARCHAR(50),
    iban VARCHAR(50),
    
    -- Job Details
    job_title VARCHAR(100),
    hire_date DATE,
    contract_type VARCHAR(50) DEFAULT 'indefinido', -- indefinido, temporal, autonomo
    
    -- Compensation (Optional base for future calculations)
    salary_base NUMERIC(10, 2),
    commission_rate NUMERIC(5, 2) DEFAULT 0, -- Percentage
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for employees
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);

-- RLS for employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select_policy" ON public.employees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = employees.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "employees_all_policy_admin" ON public.employees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = employees.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 2. Create employee_documents table
CREATE TABLE IF NOT EXISTS public.employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, -- Denormalized for RLS performance
    
    name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL, -- Storage path
    file_type VARCHAR(50), -- pdf, img, etc.
    
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for documents
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON public.employee_documents(employee_id);

-- RLS for employee_documents
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- Admins/Owners see all docs
CREATE POLICY "employee_docs_admin_all" ON public.employee_documents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = employee_documents.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- Employees see ONLY their own docs
CREATE POLICY "employee_docs_own_read" ON public.employee_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_documents.employee_id
            AND e.user_id = auth.uid() -- The logged in user is the employee
        )
    );

-- Trigger for updated_at on employees
CREATE OR REPLACE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
