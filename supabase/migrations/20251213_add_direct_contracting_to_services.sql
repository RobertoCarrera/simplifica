-- Add allow_direct_contracting to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS allow_direct_contracting BOOLEAN DEFAULT false;
