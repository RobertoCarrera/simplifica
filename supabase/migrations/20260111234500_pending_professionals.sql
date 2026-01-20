-- Make user_id nullable to support pending professionals
ALTER TABLE professionals ALTER COLUMN user_id DROP NOT NULL;

-- Add email column to store the email of the invited professional
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS email text;

-- Add constraint to ensure either user_id or email is present
ALTER TABLE professionals ADD CONSTRAINT professionals_user_or_email_check 
    CHECK (user_id IS NOT NULL OR email IS NOT NULL);

-- Create a function to link pending professionals when a user joins
CREATE OR REPLACE FUNCTION link_pending_professional()
RETURNS TRIGGER AS $$
DECLARE
    joined_user_email text;
BEGIN
    -- Get the email of the new member
    SELECT email INTO joined_user_email FROM public.users WHERE id = NEW.user_id;
    
    IF joined_user_email IS NOT NULL THEN
        -- Find pending professional with this email in the same company
        UPDATE professionals
        SET user_id = NEW.user_id,
            email = NULL -- Clear email as we now have user_id? Or keep it? Let's keep it sync or just rely on user_id. Setup to null to avoid dups? 
                         -- Actually, let's keep it null if we want to enforce canonical data from users table, OR update it.
                         -- Let's update user_id and maybe clear email if we want to treat 'email not null' as 'pending'.
        WHERE company_id = NEW.company_id 
          AND email = joined_user_email
          AND user_id IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on company_members
DROP TRIGGER IF EXISTS trigger_link_pending_professional ON company_members;
CREATE TRIGGER trigger_link_pending_professional
AFTER INSERT ON company_members
FOR EACH ROW
EXECUTE FUNCTION link_pending_professional();
