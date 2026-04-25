-- Fix: trigger_init_mail_folders must run as SECURITY DEFINER so that when an
-- admin creates a mail account for another team member, the automatic folder
-- creation doesn't fail due to RLS on mail_folders (which checks auth.uid()).

CREATE OR REPLACE FUNCTION public.initialize_mail_account_folders(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Inbox', 'INBOX', 'system', 'inbox')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Sent', 'Sent', 'system', 'sent')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Drafts', 'Drafts', 'system', 'drafts')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Trash', 'Trash', 'system', 'trash')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Spam', 'Spam', 'system', 'spam')
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_init_mail_folders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    PERFORM public.initialize_mail_account_folders(NEW.id);
    RETURN NEW;
END;
$$;
