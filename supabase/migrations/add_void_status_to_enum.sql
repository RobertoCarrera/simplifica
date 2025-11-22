-- Add 'void' to invoice_status enum
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'void';
