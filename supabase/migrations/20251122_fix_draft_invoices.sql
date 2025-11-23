-- Update existing draft invoices to approved
UPDATE invoices SET status = 'approved' WHERE status = 'draft';

-- Change default status to approved
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'approved';
