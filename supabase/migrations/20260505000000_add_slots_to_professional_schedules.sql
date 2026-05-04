-- Add slots JSONB column to professional_schedules for split shift support
ALTER TABLE professional_schedules ADD COLUMN IF NOT EXISTS slots JSONB;

-- Backfill existing records: convert start_time/end_time to slots array format
UPDATE professional_schedules
SET slots = JSONB_BUILD_ARRAY(
    JSONB_BUILD_OBJECT(
        'start', SUBSTRING(start_time FOR 5),
        'end', SUBSTRING(end_time FOR 5)
    )
)
WHERE slots IS NULL AND start_time IS NOT NULL;

-- Set default empty array for records without times
UPDATE professional_schedules
SET slots = '[]'::JSONB
WHERE slots IS NULL;

-- Make slots nullable for inactive days (they might not have times)

-- Enable RLS
ALTER TABLE professional_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: professionals can manage their own schedules
CREATE POLICY "professionals_manage_own_schedules" ON professional_schedules
    FOR ALL
    USING (
        -- Allow if professional_id matches current user's professional record
        professional_id IN (
            SELECT p.id FROM professionals p
            WHERE p.user_id = auth.uid()
        )
    )
    WITH CHECK (
        professional_id IN (
            SELECT p.id FROM professionals p
            WHERE p.user_id = auth.uid()
        )
    );