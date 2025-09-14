# Fixing RLS for `localities` and safe server-side inserts

Problem
-------
You saw this error when creating a locality from the browser:

- HTTP 403 (Forbidden)
- Postgres error code `42501` and message: `new row violates row-level security policy for table "localities"`

This means your `localities` table has Row-Level Security (RLS) enabled and the `authenticated` role used by the client does not have permission to INSERT. For security we must not expose the Supabase `service_role` key in the browser. The correct solution is to perform privileged writes from a server-side environment (Edge Function, Supabase Function, or API proxy) or add a tight RPC with `SECURITY DEFINER`.

Recommended options
-------------------
1) Add an atomic `insert_or_get_locality` SQL function (SECURITY DEFINER) and expose it as an RPC (Postgres function). The function ensures uniqueness on `postal_code` and returns the existing row if present.

2) Alternatively create a server-side Edge Function (Deno / Node) that calls Supabase with `service_role` and performs the insert-or-get logic. Call that function from the browser.

3) If you must allow direct inserts from browser, create a dedicated RLS policy that only permits `authenticated` users to INSERT specific columns and only when certain checks pass. This is less recommended.

Example SQL migration (add unique constraint + RPC)
--------------------------------------------------
-- 1. Add unique constraint on postal_code (optional but recommended)
ALTER TABLE public.localities
  ADD CONSTRAINT localities_postal_code_unique UNIQUE (postal_code);

-- 2. Create an insert-or-get function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.insert_or_get_locality(
  p_name text,
  p_province text,
  p_country text,
  p_postal_code text
)
RETURNS public.localities
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  _row public.localities;
BEGIN
  -- Try to find existing by postal_code
  SELECT * INTO _row FROM public.localities WHERE postal_code = p_postal_code LIMIT 1;
  IF FOUND THEN
    RETURN _row;
  END IF;

  -- Insert new row
  INSERT INTO public.localities (name, province, country, postal_code)
  VALUES (p_name, p_province, p_country, p_postal_code)
  RETURNING * INTO _row;

  RETURN _row;
EXCEPTION WHEN unique_violation THEN
  -- If a concurrent insert happened, select the existing row
  SELECT * INTO _row FROM public.localities WHERE postal_code = p_postal_code LIMIT 1;
  RETURN _row;
END;
$function$;

-- 3. Grant execute to authenticated role (or a narrower role)
GRANT EXECUTE ON FUNCTION public.insert_or_get_locality(text,text,text,text) TO authenticated;

Notes
-----
- Because the function is `SECURITY DEFINER`, its owner must be a role that has permission to insert into `localities` (for example the `postgres` or a migration role). Be careful: `SECURITY DEFINER` functions run with the privileges of the function owner.
- Granting `EXECUTE` to `authenticated` allows clients to call the RPC without the service_role key. The function body performs the insert.

Edge Function example (recommended when you want extra validation)
------------------------------------------------------------------
- Create an Edge Function (e.g., Deno or Node) that calls Supabase using the `service_role` key stored securely in the server environment.
- The Edge Function can validate inputs (CP format, allowed provinces, rate-limit, etc.) and then call the RPC above or insert directly.

Example (Node/Express style pseudocode):

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.post('/create-locality', async (req, res) => {
  const { name, province, country, postal_code } = req.body;
  const normalized = (postal_code || '').toString().replace(/\D+/g, '').trim();
  if (!normalized) return res.status(400).json({ error: 'postal_code required' });

  // Call the RPC to be safe
  const { data, error } = await supabase.rpc('insert_or_get_locality', { p_name: name, p_province: province, p_country: country, p_postal_code: normalized });
  if (error) return res.status(500).json({ error });
  return res.json(data);
});

app.listen(3000);

Client-side usage
-----------------
- From the browser, call your Edge Function (`/create-locality`) which will perform the safe insert using the `service_role` key.
- Alternatively, call the PostgREST RPC directly using the Supabase client: `sb.from('insert_or_get_locality').rpc(...)` — but only if your RPC is properly GRANTED for `authenticated` and implemented securely.

Quick checklist
---------------
- [ ] Add unique constraint on `postal_code` (optional but helps prevent duplicates)
- [ ] Create `insert_or_get_locality` RPC with `SECURITY DEFINER`
- [ ] Grant `EXECUTE` to `authenticated` (or a custom role)
- [ ] Optionally: implement an Edge Function and call the RPC from it
- [ ] Update `LocalitiesService.createLocality()` to call the RPC instead of direct insert (or call your Edge Function endpoint)

If you want, I can:
- Create the SQL migration file in `database/` (example .sql) and a small Edge Function example file in `supabase/functions/` in the repo.
- Update `LocalitiesService.createLocality()` to try the RPC `.rpc('insert_or_get_locality', {...})` first and then fall back to the existing logic.

Tell me which of the two options you prefer: (A) RPC with SECURITY DEFINER + client `.rpc()` call, or (B) Edge Function that calls the RPC using service_role (most secure).