ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add CHECK constraint for allowed categories
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check
  CHECK (category IN ('ticket', 'customer', 'system', 'reminder', 'workflow', 'general', 'session', 'datos'));
