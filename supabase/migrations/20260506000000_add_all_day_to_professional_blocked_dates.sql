-- Add time fields and all_day to professional_blocked_dates
-- Supports blocking specific hours or entire days in the agenda

-- all_day: true means the entire day(s) are blocked (no time selection)
-- all_day: false means specific time range within the selected dates
ALTER TABLE professional_blocked_dates ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;
ALTER TABLE professional_blocked_dates ADD COLUMN IF NOT EXISTS start_time time DEFAULT NULL;
ALTER TABLE professional_blocked_dates ADD COLUMN IF NOT EXISTS end_time time DEFAULT NULL;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_professional_blocked_dates_professional_id ON professional_blocked_dates(professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_blocked_dates_dates ON professional_blocked_dates(start_date, end_date);