-- Update auth.users to fix potential NULL scan errors in GoTrue
-- Target User: robertocarreratech@gmail.com

DO $$
BEGIN
  UPDATE auth.users
  SET 
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    recovery_token = COALESCE(recovery_token, '')
  WHERE email = 'robertocarreratech@gmail.com';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fix_auth_users_nulls: skipped (schema mismatch) — %', SQLERRM;
END $$;
