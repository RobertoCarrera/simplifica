-- Migration: Fix missing auth logic on get_company_invitation_token
-- Date: 2026-03-07

CREATE OR REPLACE FUNCTION public.get_company_invitation_token(p_invitation_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'temp'
AS $function$
DECLARE
  v_token TEXT;
  v_company_id UUID;
BEGIN
  -- 1. Obtener la compañía de la invitación
  SELECT company_id INTO v_company_id
  FROM public.company_invitations
  WHERE id = p_invitation_id;

  -- 2. Verificar permisos del usuario actual en esa compañía (owner o admin)
  IF NOT public.has_company_permission(v_company_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'No tienes permiso para obtener este enlace';
  END IF;

  -- 3. Obtener el token
  SELECT token INTO v_token
  FROM public.company_invitations
  WHERE id = p_invitation_id;

  RETURN v_token;
END;
$function$
