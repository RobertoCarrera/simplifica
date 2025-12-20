-- Add variant_id column to ticket_services table
-- This allows linking a specific service variant to a ticket service line item

ALTER TABLE ticket_services 
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES service_variants(id);

-- Add index for better performance on variant lookups
CREATE INDEX IF NOT EXISTS idx_ticket_services_variant_id ON ticket_services(variant_id);
