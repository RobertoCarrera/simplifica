-- Temporary migration for local testing
-- Maps test emails to existing client profiles

INSERT INTO public.client_portal_users (company_id, client_id, email, is_active)
VALUES (
    '9a3fec68-47cd-4c1a-b74b-5803a2bba442', 
    '21389baf-5008-48ee-9e8a-acdfec1d20ff', 
    'servicio.pcgo@gmail.com', 
    true
) ON CONFLICT (company_id, client_id, email) DO UPDATE SET is_active = true;

INSERT INTO public.client_portal_users (company_id, client_id, email, is_active)
VALUES (
    'cd830f43-f6f0-4b78-a2a4-505e4e0976b5', 
    '0737c4bf-4d57-47ce-ac8c-fe01f3f884ec', 
    'puchu_114@hotmail.com', 
    true
) ON CONFLICT (company_id, client_id, email) DO UPDATE SET is_active = true;
