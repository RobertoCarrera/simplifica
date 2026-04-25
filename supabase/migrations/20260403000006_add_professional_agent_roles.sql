-- Add missing roles that the frontend dropdown offers but didn't exist in app_roles
-- professional and agent are valid staff roles for service-based businesses
INSERT INTO public.app_roles (name, label, description)
VALUES
  ('professional', 'Profesional', 'Profesional que presta servicios'),
  ('agent', 'Agente', 'Agente de atención al cliente')
ON CONFLICT (name) DO NOTHING;

-- Fix handle_new_user trigger to use the email username as fallback name
-- instead of the hardcoded 'Usuario Nuevo' placeholder which confuses admins
-- when inviting new users who haven't set a full_name yet
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $$
begin
  insert into public.users (id, auth_user_id, email, name, active)
  values (
    new.id,
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    true
  );
  return new;
end;
$$;

NOTIFY pgrst, 'reload schema';
