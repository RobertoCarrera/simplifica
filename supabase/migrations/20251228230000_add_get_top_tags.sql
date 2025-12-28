-- Create get_top_tags function
CREATE OR REPLACE FUNCTION public.get_top_tags(search_scope text, limit_count int)
RETURNS SETOF public.global_tags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF search_scope = 'clients' THEN
    RETURN QUERY
    SELECT gt.*
    FROM public.global_tags gt
    JOIN public.clients_tags ct ON gt.id = ct.tag_id
    GROUP BY gt.id
    ORDER BY count(*) DESC, gt.name
    LIMIT limit_count;
  ELSIF search_scope = 'tickets' THEN
    -- Try to use the table that the service is actually using
    RETURN QUERY
    SELECT gt.*
    FROM public.global_tags gt
    JOIN public.ticket_tag_relations ttr ON gt.id = ttr.tag_id
    GROUP BY gt.id
    ORDER BY count(*) DESC, gt.name
    LIMIT limit_count;
  ELSE
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_tags(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_tags(text, int) TO service_role;
