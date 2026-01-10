-- Update auth.users to fix potential NULL scan errors in GoTrue
-- Target User: robertocarreratech@gmail.com

UPDATE auth.users
SET 
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE email = 'robertocarreratech@gmail.com';

-- Verify the user status
SELECT id, email, phone, email_confirmed_at, banned_until, raw_app_meta_data
FROM auth.users
WHERE email = 'robertocarreratech@gmail.com';
