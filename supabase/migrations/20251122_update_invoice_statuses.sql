-- Add new statuses to invoice_status enum
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'issued';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'rectified';

-- Update comments/documentation if needed
COMMENT ON TYPE invoice_status IS 'draft, sent, paid, partial, overdue, cancelled, approved, issued, rectified';
