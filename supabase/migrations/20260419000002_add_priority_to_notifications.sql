-- Add priority column to notifications table
-- Required by the Angular service which selects this column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.notifications
      ADD COLUMN priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
  END IF;
END $$;

COMMENT ON COLUMN public.notifications.priority IS 'Notification priority: low, medium, high (intrusive), urgent';
