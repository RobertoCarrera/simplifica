-- Add color and order_position columns to resources table
-- color: UI color for visual labeling of resources
-- order_position: manual sort order

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS order_position INTEGER;
