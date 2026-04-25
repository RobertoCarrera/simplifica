// @ts-nocheck
// Edge Function: offboard-professional
// Purpose: Wraps the offboard_professional RPC with auth, CSRF, rate limiting, and CORS.
//          Handles professional offboarding: deactivation, client/booking transfers, audit logging.
// Security:
//   - Requires Authorization: Bearer <JWT>
//   - CSRF validated via withCsrf middleware
//   - Validates origin against ALLOWED_ORIGINS
//   - Rate limited (30 req/min — destructive operation)
//   - Service role used for RPC call (SECURITY DEFINER handles permission checks internally)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { withCsrf } from '../_shared/csrf-middleware.ts';

const FN_NAME = 'offboard-professional';

function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`[${FN_NAME}] Missing required env vars SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
}

function corsHeaders(origin?: string) {
  const h = new Headers();
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type, x-csrf-token');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
  }
  h.set('Content-Type', 'application/json');
  h.set('X-Function-Name', FN_NAME);
  return h;
}

function originAllowed(origin?: string) {
  if (!origin) return true; // server-side
  return ALLOWED_ORIGINS.includes(origin);
}

serve(withCsrf(async (req) => {
  const requestId = generateRequestId();
  const origin = req.headers.get('Origin') || req.headers.get('origin') || undefined;
  const headers = corsHeaders(origin);
  headers.set('X-Request-ID', requestId);

  // Preflight
  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers,
      });
    }
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }),
      { status: 405, headers },
    );
  }

  if (!originAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers,
    });
  }

  // Rate limit — 30 req/min (destructive operation)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rl = await checkRateLimit(`${FN_NAME}:${ip}`, 30, 60000);
  headers.set('X-RateLimit-Limit', rl.limit.toString());
  headers.set('X-RateLimit-Remaining', rl.remaining.toString());
  headers.set('X-RateLimit-Reset', new Date(rl.resetAt).toISOString());
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
      }),
      { status: 429, headers },
    );
  }

  try {
    // Auth
    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), {
        status: 401,
        headers,
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      console.warn(`[${FN_NAME}][${requestId}] Auth failed:`, authErr?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }

    const userId = authData.user.id;
    console.log(`[${FN_NAME}][${requestId}] Authenticated user=${userId}`);

    // Parse body
    const body = await req.json().catch(() => ({}));
    const professionalId = body?.professional_id;

    if (!professionalId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: professional_id' }),
        { status: 400, headers },
      );
    }

    // Call the RPC via service role (SECURITY DEFINER handles permission checks internally)
    console.log(`[${FN_NAME}][${requestId}] Calling offboard_professional for professional=${professionalId}`);

    const { data, error } = await supabaseAdmin.rpc('offboard_professional', {
      p_professional_id: professionalId,
      p_to_professional_id: body.to_professional_id || null,
      p_reason: body.reason || '',
      p_cancel_future_bookings: body.cancel_future_bookings ?? true,
      p_transfer_bookings: body.transfer_bookings ?? true,
    });

    if (error) {
      console.error(`[${FN_NAME}][${requestId}] RPC error:`, error.message);
      return new Response(
        JSON.stringify({ error: error.message || 'offboard_professional failed' }),
        { status: 500, headers },
      );
    }

    console.log(`[${FN_NAME}][${requestId}] Offboard completed for professional=${professionalId}`);
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (err) {
    console.error(`[${FN_NAME}][${requestId}] Unexpected error:`, err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers },
    );
  }
}));
