-- Create overlay table to store per-company ordering for generic (system) stages
CREATE TABLE IF NOT EXISTS company_stage_order (
  company_id UUID NOT NULL,
  stage_id UUID NOT NULL REFERENCES ticket_stages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, stage_id)
);

-- Helpful indexesrrr
CREATE INDEX IF NOT EXISTS idx_company_stage_order_company ON company_stage_order(company_id);
CREATE INDEX IF NOT EXISTS idx_company_stage_order_company_position ON company_stage_order(company_id, position);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_stage_order_updated_at ON company_stage_order;
CREATE TRIGGER trg_company_stage_order_updated_at
BEFORE UPDATE ON company_stage_order
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
