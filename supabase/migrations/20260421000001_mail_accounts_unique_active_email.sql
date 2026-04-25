-- Replace UNIQUE(user_id, email) with a partial unique index on email WHERE is_active = true.
-- This prevents the same email address from being assigned to two different active accounts
-- while still allowing archived/inactive rows to coexist (historical records).

-- Drop the existing composite unique constraint
ALTER TABLE public.mail_accounts
  DROP CONSTRAINT IF EXISTS mail_accounts_user_id_email_key;

-- Add a partial unique index: only one active account per email globally
CREATE UNIQUE INDEX mail_accounts_active_email_unique
  ON public.mail_accounts (email)
  WHERE is_active = true;
