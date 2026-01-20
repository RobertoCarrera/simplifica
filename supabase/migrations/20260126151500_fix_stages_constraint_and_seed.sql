-- Migration: 20260126151500_fix_stages_constraint_and_seed.sql

-- 1. Create Unique Index for System Stages (allows ON CONFLICT to work)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_stages_system_name 
ON public.ticket_stages (name) 
WHERE company_id IS NULL;

-- 2. Seed Default System Stages
INSERT INTO public.ticket_stages 
(name, position, color, company_id, stage_category, workflow_category, created_at, updated_at)
VALUES 
-- 1. Recibido (Blue)
('Recibido', 10, '#3B82F6', NULL, 'open', 'action', NOW(), NOW()),

-- 2. En Análisis (Purple)
('En Análisis', 20, '#8B5CF6', NULL, 'open', 'analysis', NOW(), NOW()),

-- 3. En Curso (Amber)
('En Curso', 30, '#F59E0B', NULL, 'in_progress', 'action', NOW(), NOW()),

-- 4. Esperando Respuesta (Gray)
('Esperando Respuesta', 40, '#6B7280', NULL, 'on_hold', 'waiting', NOW(), NOW()),

-- 5. Resuelto (Green)
('Resuelto', 50, '#10B981', NULL, 'completed', 'final', NOW(), NOW()),

-- 6. Cancelado (Red)
('Cancelado', 60, '#EF4444', NULL, 'completed', 'cancel', NOW(), NOW())

ON CONFLICT (name) WHERE company_id IS NULL 
DO UPDATE SET 
    position = EXCLUDED.position,
    color = EXCLUDED.color,
    stage_category = EXCLUDED.stage_category,
    workflow_category = EXCLUDED.workflow_category;
