-- Add lead_id to invoices table for ROI calculation
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_invoices_lead_id ON invoices(lead_id);
