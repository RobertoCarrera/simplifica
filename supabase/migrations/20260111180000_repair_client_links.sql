-- 1. Repair existing unlinked clients
UPDATE public.clients c
SET 
  auth_user_id = u.auth_user_id,
  updated_at = now()
FROM public.users u
WHERE c.email = u.email 
  AND c.auth_user_id IS NULL 
  AND u.auth_user_id IS NOT NULL;

-- 2. Create self-healing RPC
CREATE OR REPLACE FUNCTION public.sync_client_profile()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_count int;
begin
  UPDATE public.clients c
  SET 
    auth_user_id = auth.uid(),
    updated_at = now()
  FROM public.users u
  WHERE c.email = u.email 
    AND u.auth_user_id = auth.uid()
    AND (c.auth_user_id IS NULL OR c.auth_user_id != auth.uid());
    
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  return json_build_object('success', true, 'updated_count', v_count);
end;
$function$;
