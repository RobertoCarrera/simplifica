-- Migration: 20260126150000_seed_ticket_stages.sql

INSERT INTO public.ticket_stages 
(name, position, color, company_id, stage_category, workflow_category, created_at, updated_at)
VALUES 
-- 1. Recibido (Estado inicial)
('Recibido', 10, '#3B82F6', NULL, 'open', 'action', NOW(), NOW()),

-- 2. En Análisis (Triaje)
('En Análisis', 20, '#8B5CF6', NULL, 'open', 'analysis', NOW(), NOW()),

-- 3. En Curso (Trabajando)
('En Curso', 30, '#F59E0B', NULL, 'in_progress', 'action', NOW(), NOW()),

-- 4. Esperando Respuesta (Bloqueado por cliente/tercero)
('Esperando Respuesta', 40, '#6B7280', NULL, 'on_hold', 'waiting', NOW(), NOW()),

-- 5. Resuelto (Finalizado con éxito)
('Resuelto', 50, '#10B981', NULL, 'completed', 'final', NOW(), NOW()),

-- 6. Cancelado (Finalizado sin éxito)
('Cancelado', 60, '#EF4444', NULL, 'completed', 'cancel', NOW(), NOW())

ON CONFLICT (name) WHERE company_id IS NULL DO NOTHING;
