-- Backfill: create system folders for mail_accounts that were created before
-- the trigger_init_mail_folders was changed to SECURITY DEFINER.
-- Affects accounts where an admin created the account for a team member and the
-- RLS on mail_folders silently blocked folder creation.
--
-- initialize_mail_account_folders() is already SECURITY DEFINER (migration 009)
-- and uses ON CONFLICT DO NOTHING, so this is idempotent.

DO $$
DECLARE
    acc RECORD;
BEGIN
    FOR acc IN
        SELECT id
        FROM public.mail_accounts
        WHERE id NOT IN (
            SELECT DISTINCT account_id FROM public.mail_folders
        )
    LOOP
        PERFORM public.initialize_mail_account_folders(acc.id);
        RAISE NOTICE 'Initialized folders for mail_account %', acc.id;
    END LOOP;
END;
$$;
