-- Create project_subtasks table (children of project_tasks)
CREATE TABLE IF NOT EXISTS public.project_subtasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    due_date DATE,
    is_completed BOOLEAN DEFAULT false,
    assigned_to UUID REFERENCES auth.users(id),
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.project_subtasks ENABLE ROW LEVEL SECURITY;

-- Policies for project_subtasks (same chain as project_tasks: subtask → task → project → company)
CREATE POLICY "Enable access for company members" ON public.project_subtasks
    FOR ALL
    USING (task_id IN (
        SELECT pt.id FROM public.project_tasks pt
        WHERE pt.project_id IN (
            SELECT p.id FROM public.projects p
            WHERE p.company_id IN (
                SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
            )
        )
    ));

-- Create project_subtask_overdue_justifications table
CREATE TABLE IF NOT EXISTS public.project_subtask_overdue_justifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subtask_id UUID NOT NULL REFERENCES public.project_subtasks(id) ON DELETE CASCADE,
    justification TEXT NOT NULL,
    new_due_date DATE NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.project_subtask_overdue_justifications ENABLE ROW LEVEL SECURITY;

-- Policies for justifications (same chain)
CREATE POLICY "Enable access for company members" ON public.project_subtask_overdue_justifications
    FOR ALL
    USING (subtask_id IN (
        SELECT ps.id FROM public.project_subtasks ps
        WHERE ps.task_id IN (
            SELECT pt.id FROM public.project_tasks pt
            WHERE pt.project_id IN (
                SELECT p.id FROM public.projects p
                WHERE p.company_id IN (
                    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
                )
            )
        )
    ));

-- Trigger to auto-update updated_at on project_subtasks
CREATE OR REPLACE FUNCTION public.update_project_subtask_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_subtask_updated_at ON public.project_subtasks;
CREATE TRIGGER trigger_update_project_subtask_updated_at
    BEFORE UPDATE ON public.project_subtasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_project_subtask_updated_at();

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_project_subtasks_task_id ON public.project_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_project_subtask_justifications_subtask_id ON public.project_subtask_overdue_justifications(subtask_id);
