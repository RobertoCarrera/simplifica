-- Check if client is active (Corrected column name)
SELECT id, email, is_active FROM public.clients WHERE email = 'puchu_114@hotmail.com';

-- Force activation just in case (optional, run if the above is false)
-- UPDATE public.clients SET is_active = true WHERE email = 'puchu_114@hotmail.com';
