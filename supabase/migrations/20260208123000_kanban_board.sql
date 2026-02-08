-- Create project_stages table
CREATE TABLE IF NOT EXISTS public.project_stages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    stage_id UUID REFERENCES public.project_stages(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create project_tasks table
CREATE TABLE IF NOT EXISTS public.project_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    due_date DATE,
    assigned_to UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- Functions helper
-- We assume `is_company_member` or similar exists, but let's use the explicit checks seen in previous migrations for maximum compatibility.

-- Policies for project_stages
CREATE POLICY "Enable access for company members" ON public.project_stages
    FOR ALL
    USING (company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ));

-- Policies for projects
CREATE POLICY "Enable access for company members" ON public.projects
    FOR ALL
    USING (company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ));

-- Policies for project_tasks
-- Tasks belong to a project, so we check the project's company
CREATE POLICY "Enable access for company members" ON public.project_tasks
    FOR ALL
    USING (project_id IN (
        SELECT id FROM public.projects WHERE company_id IN (
            SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
        )
    ));

-- Seed default stages function
-- This function can be called after creating a company to set up default stages
CREATE OR REPLACE FUNCTION public.create_default_project_stages(company_uuid UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO public.project_stages (company_id, name, position) VALUES
    (company_uuid, 'Por hacer', 0),
    (company_uuid, 'En progreso', 1),
    (company_uuid, 'Revisión', 2),
    (company_uuid, 'Terminado', 3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
