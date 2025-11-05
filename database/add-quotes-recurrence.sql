-- Add recurrence fields to quotes for recurring invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'recurrence_type'
  ) THEN
    ALTER TABLE quotes
      ADD COLUMN recurrence_type text NOT NULL DEFAULT 'none', -- none|weekly|monthly|quarterly|yearly
      ADD COLUMN recurrence_interval integer NOT NULL DEFAULT 1, -- every N units
      ADD COLUMN recurrence_day integer, -- day of month (1-28) for monthly/yearly, or 0-6 for weekly (Sun=0)
      ADD COLUMN recurrence_start_date date,
      ADD COLUMN recurrence_end_date date,
      ADD COLUMN next_run_at timestamptz,
      ADD COLUMN last_run_at timestamptz;

    CREATE INDEX IF NOT EXISTS idx_quotes_next_run_at ON quotes(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_quotes_recurrence_type ON quotes(recurrence_type);
  END IF;
END $$;
