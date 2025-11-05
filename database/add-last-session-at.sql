-- Add last_session_at column to profiles table for tracking user sessions

-- Check if column exists, if not add it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'last_session_at'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN last_session_at timestamp with time zone;
    
    -- Set initial value to current timestamp for existing users
    UPDATE profiles 
    SET last_session_at = NOW()
    WHERE last_session_at IS NULL;
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_session_at 
ON profiles(last_session_at);
