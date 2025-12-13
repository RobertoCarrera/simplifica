import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

type ConvertPolicy = 'manual' | 'automatic' | 'scheduled' | 'on_accept' | string;

serve(async (req) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  } as const;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Validate token/user
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Read optional body ({ id }) safely
    let payload: any = null;
    try {
      payload = await req.json();
    } catch {
      payload = null;
    }

    const quoteId: string | undefined = payload?.id;

    // Resolve app user + company
    // Use admin client to bypass RLS and ensure we find the user by auth_user_id
    let appUser: any = null;
    
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('id, email, role, company_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (userData && userData.role === 'client') {
      appUser = userData;
    } else {
       // Fallback to clients table
       const { data: clientData } = await supabaseAdmin
        .from('clients')
        .select('id, email, company_id, is_active')
        .eq('auth_user_id', user.id)
        .maybeSingle();
        
       if (clientData && clientData.is_active) {
         appUser = {
           id: clientData.id,
           email: clientData.email,
           role: 'client',
           company_id: clientData.company_id
         };
       }
    }

    if (!appUser) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    if ((appUser as any).role !== 'client') {
      return new Response(JSON.stringify({ error: 'Forbidden: only client users' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const userEmailLower = String((appUser as any).email || '').toLowerCase();

    // IMPORTANT: Match the SQL portal functions.
    // Derive company_id + client_id primarily from client_portal_users by JWT email,
    // not from users.company_id (which may be unset/mismatched for client accounts).
    let company_id: string | null = null;
    let client_id: string | null = null;
    {
      const { data: mapRow } = await supabaseAdmin
        .from('client_portal_users')
        .select('company_id, client_id')
        .ilike('email', userEmailLower)
        .eq('is_active', true)
        .maybeSingle();

      if (mapRow) {
        company_id = (mapRow as any).company_id ?? null;
        client_id = (mapRow as any).client_id ?? null;
      }
    }

    // Optional fallback for legacy setups: if there's no mapping row but user has company_id set,
    // try resolving client by email within that company.
    if ((!company_id || !client_id) && (appUser as any).company_id) {
      const fallbackCompanyId = String((appUser as any).company_id);
      const { data: c } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('company_id', fallbackCompanyId)
        .ilike('email', userEmailLower)
        .maybeSingle();
      if (c?.id) {
        company_id = fallbackCompanyId;
        client_id = c.id as string;
      }
    }

    if (!company_id || !client_id) {
      return new Response(JSON.stringify({ error: 'No client mapping found for user' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Helper: compute effective policy (only needed for detail)
    const computeEffectivePolicy = async (quoteRow: any): Promise<ConvertPolicy> => {
      const [{ data: appSettings }, { data: compSettings }] = await Promise.all([
        supabaseAdmin.from('app_settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
        supabaseAdmin.from('company_settings').select('*').eq('company_id', company_id as string).maybeSingle(),
      ]);

      const app = (appSettings || {}) as any;
      const cmp = (compSettings || {}) as any;
      const q = (quoteRow || {}) as any;

      const appPolicy: ConvertPolicy = app.default_convert_policy || 'manual';
      const cmpPolicy: ConvertPolicy | null = cmp.convert_policy || null;
      const quotePolicy: ConvertPolicy | null = q.convert_policy || null;

      let effectivePolicy: ConvertPolicy = appPolicy;

      if (app.enforce_globally === true) {
        effectivePolicy = appPolicy;
      } else if (cmp.enforce_company_defaults === true) {
        effectivePolicy = (cmpPolicy || appPolicy) as ConvertPolicy;
      } else {
        effectivePolicy = (quotePolicy || cmpPolicy || appPolicy) as ConvertPolicy;
      }

      // Normalize legacy/alternate policy values if present.
      if (effectivePolicy === 'on_accept') return 'automatic';

      return effectivePolicy;
    };

    if (quoteId) {
      // Quote detail (with items)
      const { data: quote, error: qErr } = await supabaseAdmin
        .from('quotes')
        .select(
          `
          id,
          company_id,
          client_id,
          full_quote_number,
          title,
          status,
          quote_date,
          valid_until,
          total_amount,
          convert_policy,
          items:quote_items(*)
        `
        )
        .eq('id', quoteId)
          .eq('company_id', company_id)
        .eq('client_id', client_id)
        .maybeSingle();

      if (qErr || !quote) {
        return new Response(JSON.stringify({ error: 'Quote not found or access denied' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const effective_convert_policy = await computeEffectivePolicy(quote);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            ...(quote as any),
            effective_convert_policy,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        }
      );
    }

    // Quotes list
    const { data: quotes, error: listErr } = await supabaseAdmin
      .from('quotes')
      .select('id, company_id, client_id, full_quote_number, title, status, quote_date, valid_until, total_amount')
      .eq('company_id', company_id)
      .eq('client_id', client_id)
      .neq('status', 'draft') // Exclude drafts
      .order('quote_date', { ascending: false });

    if (listErr) {
      return new Response(JSON.stringify({ error: listErr.message || 'Failed to list quotes' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({ success: true, data: quotes || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});
