-- Optimización de rendimiento para tickets
-- Indices para claves foráneas y campos de ordenamiento frecuentes

CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_stage_id ON tickets(stage_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC);

-- Opcional: Indice compuesto para filtrado común (company + stage)
CREATE INDEX IF NOT EXISTS idx_tickets_company_stage ON tickets(company_id, stage_id);
