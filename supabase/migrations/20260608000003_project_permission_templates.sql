-- Create project_permission_templates table (global defaults per company)
-- When a new project is created, these values are cloned into project_permissions.
CREATE TABLE IF NOT EXISTS public.project_permission_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_can_create_tasks BOOLEAN DEFAULT false,
    client_can_edit_tasks BOOLEAN DEFAULT false,
    client_can_delete_tasks BOOLEAN DEFAULT false,
    client_can_assign_tasks BOOLEAN DEFAULT false,
    client_can_complete_tasks BOOLEAN DEFAULT false,
    client_can_comment BOOLEAN DEFAULT true,
    client_can_view_all_comments BOOLEAN DEFAULT true,
    client_can_edit_project BOOLEAN DEFAULT false,
    client_can_move_stage BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- One template per company
    UNIQUE (company_id)
);

-- Enable RLS
ALTER TABLE public.project_permission_templates ENABLE ROW LEVEL SECURITY;

-- RLS: company members can read the template for their company
CREATE POLICY "Company members can read project permission template"
    ON public.project_permission_templates
    FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
        )
    );

-- RLS: owner/admin can insert/update/delete the template for their company
CREATE POLICY "Owner/admin can manage project permission template"
    ON public.project_permission_templates
    FOR ALL
    USING (
        company_id IN (
            SELECT cm.company_id
            FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
              AND cm.role IN ('owner', 'admin', 'super_admin')
        )
    )
    WITH CHECK (
        company_id IN (
            SELECT cm.company_id
            FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
              AND cm.role IN ('owner', 'admin', 'super_admin')
        )
    );

-- Index for fast lookup by company
CREATE INDEX IF NOT EXISTS idx_project_perm_templates_company
    ON public.project_permission_templates (company_id);
