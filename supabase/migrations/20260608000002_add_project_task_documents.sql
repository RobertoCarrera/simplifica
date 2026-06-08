-- ============================================================================
-- Migration: project_task_documents — asociación de Presupuestos/Facturas a tareas
-- Date: 2026-06-08
-- 
-- Permite asociar Presupuestos (quotes) y Facturas (invoices) a tareas y subtareas
-- de Proyectos mediante una tabla de unión polimórfica.
--
-- document_type: 'budget' → public.quotes, 'invoice' → public.invoices
-- RLS: misma cadena que project_tasks (document → task → project → company)
-- ============================================================================

-- ── 1. Create junction table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_task_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
    document_id UUID NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('budget', 'invoice')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Un documento sólo puede estar asociado una vez a la misma tarea
    UNIQUE(task_id, document_id, document_type)
);

COMMENT ON TABLE public.project_task_documents IS 'Asocia presupuestos (document_type=budget) y facturas (document_type=invoice) a tareas de proyectos.';
COMMENT ON COLUMN public.project_task_documents.document_type IS 'budget = presupuesto (public.quotes), invoice = factura (public.invoices)';

-- ── 2. Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.project_task_documents ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS Policies (chain: document → task → project → company) ─────────────
CREATE POLICY "Enable access for company members" ON public.project_task_documents
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

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_project_task_documents_task_id ON public.project_task_documents(task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_documents_document ON public.project_task_documents(document_id, document_type);
