// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
import { withCsrf } from '../_shared/csrf-middleware.ts';


serve(withCsrf(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  // Rate limiting: 30 req/min per IP (invoice issuing — VeriFactu fiscal operation)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`issue-invoice:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ── Auth: get user from Bearer token ──────────────────────────────────
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user company_id for RLS enforcement
    const { data: me } = await admin
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single();
    if (!me) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { invoiceid, deviceid, softwareid } = await req.json();

    if (!invoiceid) {
      throw new Error('Missing invoiceid');
    }

    // Validate UUID format for all parameters to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(invoiceid)) {
      return new Response(JSON.stringify({ error: 'Invalid invoiceid format' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    if (deviceid && !uuidRegex.test(deviceid)) {
      return new Response(JSON.stringify({ error: 'Invalid deviceid format' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    if (softwareid && !uuidRegex.test(softwareid)) {
      return new Response(JSON.stringify({ error: 'Invalid softwareid format' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 1. SECURITY VALIDATION (IDOR + Company Check)
    // Verify the invoice exists AND belongs to the user's company.
    const { data: invoiceCheck, error: checkError } = await supabaseClient
      .from('invoices')
      .select('id, company_id')
      .eq('id', invoiceid)
      .eq('company_id', me.company_id)
      .maybeSingle();

    if (checkError || !invoiceCheck) {
      console.error('[issue-invoice] Invoice check failed', checkError?.message);
      return new Response(
        JSON.stringify({
          error: 'Acceso denegado o factura no encontrada',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      );
    }

    // 2. RPC EXECUTION (Now safe)
    // Call the RPC that handles the logic
    // Note: Based on SQL search, 'verifactu_preflight_issue' seems to contain the logic
    // for chaining and hashing, despite the name "preflight".
    // We will use it for now as the implementation.
    const { data, error } = await supabaseClient.rpc('verifactu_preflight_issue', {
      pinvoice_id: invoiceid,
      pdevice_id: deviceid,
      psoftware_id: softwareid,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, ...data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('issue-invoice error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}));
