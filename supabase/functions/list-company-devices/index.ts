// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Config
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);

// Function metadata
const FUNCTION_NAME = 'list-company-devices';
const FUNCTION_VERSION = '2025-09-16-1';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false },
});

function corsHeaders(origin: string | null) {
  const headers = new Headers();
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (ALLOW_ALL_ORIGINS) {
    headers.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
    if (allowed) headers.set('Access-Control-Allow-Origin', allowed);
  }
  return headers;
}

function isOriginAllowed(origin: string | null) {
  if (!origin) return false;
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function jsonResponse(status: number, body: any, origin: string | null) {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Function-Name', FUNCTION_NAME);
  headers.set('X-Function-Version', FUNCTION_VERSION);
  return new Response(JSON.stringify(body), { status, headers });
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(origin);
    if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
    }
    return new Response(null, { status: 200, headers });
  }

  // Only POST
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }, origin);
  }

  // CORS check for actual request
  if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
    return jsonResponse(403, { error: 'Origin not allowed' }, origin);
  }

  // Auth: require Bearer token
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return jsonResponse(401, { error: 'Missing Authorization bearer token' }, origin);
  }

  let authUserId: string | null = null;
  try {
    const userRes = await supabaseAdmin.auth.getUser(tokenMatch[1]);
    if (userRes.error || !userRes.data?.user) {
      return jsonResponse(401, { error: 'Invalid or expired token' }, origin);
    }
    authUserId = userRes.data.user.id;
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] auth.getUser error`, e);
    return jsonResponse(401, { error: 'Invalid token' }, origin);
  }

  // Parse JSON
  let body: any = null;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse(400, { error: 'Invalid JSON body' }, origin);
  }

  // Only accept p_* keys
  const received_keys = Object.keys(body || {});
  const invalidKeys = received_keys.filter((k) => !k.startsWith('p_'));
  if (invalidKeys.length > 0) {
    return jsonResponse(400, {
      error: 'Only p_* keys are accepted',
      details: { invalidKeys, received_keys },
    }, origin);
  }

  // Required params
  const REQUIRED = ['p_company_id'];
  const missing = REQUIRED.filter((k) => !(k in body));
  if (missing.length > 0) {
    return jsonResponse(400, {
      error: `Missing required fields: ${missing.join(', ')}`,
      details: { required: REQUIRED, received_keys },
    }, origin);
  }

  const p_company_id = String(body.p_company_id);

  try {
    // Verify user membership via public.users
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('company_id', p_company_id)
      .eq('active', true)
      .maybeSingle();
    if (userErr || !userRow) {
      if (userErr) console.warn(`[${FUNCTION_NAME}] users check error`, userErr);
      return jsonResponse(403, { error: 'User not allowed for this company', code: 'not_company_member' }, origin);
    }

    // Fetch devices for the company, latest first
    const { data: devices, error: devErr } = await supabaseAdmin
      .from('devices')
      .select('*')
      .eq('company_id', p_company_id)
      .order('received_at', { ascending: false });

    if (devErr) {
      console.error(`[${FUNCTION_NAME}] devices select error`, devErr);
      return jsonResponse(500, { error: 'Internal select error', details: devErr }, origin);
    }

    return jsonResponse(200, { result: devices || [] }, origin);
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Internal error`, e);
    return jsonResponse(500, { error: 'Internal server error', details: e?.message || e }, origin);
  }
});

/*
Quick tests:

OPTIONS
curl -i -X OPTIONS "https://<PROJECT>.supabase.co/functions/v1/list-company-devices" \
  -H "Origin: http://localhost:4200"

POST
curl -i -X POST "https://<PROJECT>.supabase.co/functions/v1/list-company-devices" \
  -H "Origin: http://localhost:4200" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "p_company_id": "<UUID>" }'

Deploy:
  supabase functions deploy list-company-devices --project-ref <PROJECT_REF>
*/
