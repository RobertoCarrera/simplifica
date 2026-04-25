-- Enable Realtime for mail_messages so the webmail UI receives live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_messages;
