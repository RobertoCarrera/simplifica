// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);

// Configuration for this function
const FUNCTION_NAME = 'create-address';
const RPC_NAME = 'insert_or_get_address'; // try RPC first
const TABLE_NAME = 'addresses';
const UNIQUE_ON = 'direccion,locality_id,usuario_id';
const REQUIRED_FIELDS = ['p_direccion','p_locality_id'];
const OPTIONAL_FIELDS = ['p_numero'];
const NUMERIC_ONLY_FIELD = ''; // no numeric-only field for addresses

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing required environment variables SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
}

const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false }
});

function jsonResponse(status: number, body: any, originAllowedHeader = '*') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Origin', originAllowedHeader);
  return new Response(JSON.stringify(body), { status, headers });
}

function isOriginAllowed(origin: string | null) {
  if (!origin) return false;
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  // CORS preflight
  if (req.method === 'OPTIONS') {
    const allow = (ALLOW_ALL_ORIGINS || isOriginAllowed(origin)) ? (origin || '*') : '';
    if (!allow) return jsonResponse(403, { error: 'Origin not allowed' }, '');
    const headers = new Headers();
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Origin', allow);
    return new Response(null, { status: 200, headers });
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed', allowed: ['POST','OPTIONS'] }, '*');
  }

  // CORS origin check for POST
  if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
    return jsonResponse(403, { error: 'Origin not allowed' }, '');
  }

  // Auth: require Authorization: Bearer <JWT>
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return jsonResponse(401, { error: 'Missing Authorization bearer token' }, origin || '*');
  }
  const token = tokenMatch[1];

  // Validate token with Supabase (not exposing service key)
  let authUserId: string | null = null;
  try {
    const userRes = await supabaseAdmin.auth.getUser(token);
    if (userRes.error || !userRes.data?.user) {
      console.warn(`[${FUNCTION_NAME}] auth.getUser failed`, userRes.error);
      return jsonResponse(401, { error: 'Invalid or expired token' }, origin || '*');
    }
    authUserId = userRes.data.user.id;
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Error validating token`, e.message || e);
    return jsonResponse(401, { error: 'Invalid token' }, origin || '*');
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid JSON body' }, origin || '*');
  }

  // Only accept canonical p_ keys
  const received_keys = Object.keys(body || {});
  const invalidKeys = received_keys.filter(k => !k.startsWith('p_'));
  if (invalidKeys.length > 0) {
    return jsonResponse(400, { error: 'Only p_* keys are accepted', details: { invalidKeys, received_keys } }, origin || '*');
  }

  // Required fields validation
  const missing = REQUIRED_FIELDS.filter(f => !(f in body));
  if (missing.length > 0) {
    return jsonResponse(400, { error: `Missing required fields: ${missing.join(', ')}`, details: { required: REQUIRED_FIELDS, optional: OPTIONAL_FIELDS, received_keys } }, origin || '*');
  }

  // Build DB payload and normalize
  const payload: any = {
    direccion: (body.p_direccion || '').toString().trim(),
    numero: body.p_numero !== undefined ? (body.p_numero === null ? null : body.p_numero) : null,
    locality_id: body.p_locality_id || null,
    usuario_id: authUserId
  };

  // Normalize numeric-only field if configured
  if (NUMERIC_ONLY_FIELD && body[NUMERIC_ONLY_FIELD]) {
    payload[NUMERIC_ONLY_FIELD.replace(/^p_/, '')] = (body[NUMERIC_ONLY_FIELD] || '').toString().replace(/\D+/g, '');
  }

  try {
    // Attempt RPC first (if configured)
    if (RPC_NAME) {
      try {
        console.log(`[${FUNCTION_NAME}] Calling RPC ${RPC_NAME} with payload`, { p_direccion: payload.direccion, p_locality_id: payload.locality_id, p_numero: payload.numero });
        const rpcRes = await supabaseAdmin.rpc(RPC_NAME, {
          p_direccion: payload.direccion,
          p_locality_id: payload.locality_id,
          p_numero: payload.numero,
          p_usuario_id: payload.usuario_id
        });
        // Some supabase clients return { data, error }
        const rpcData = rpcRes?.data ?? rpcRes;
        if (rpcRes?.error) {
          console.warn(`[${FUNCTION_NAME}] RPC ${RPC_NAME} returned error`, rpcRes.error);
          throw rpcRes.error;
        }
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (row) {
          return jsonResponse(200, { result: row }, origin || '*');
        }
        // If RPC returned no row, fallthrough to upsert
        console.warn(`[${FUNCTION_NAME}] RPC ${RPC_NAME} returned no row, falling back to upsert`);
      } catch (rpcErr) {
        // If RPC not found or permission error, we'll fall back. But log for diagnostics.
        console.warn(`[${FUNCTION_NAME}] RPC ${RPC_NAME} failed, falling back to upsert`, rpcErr?.message || rpcErr);
      }
    }

    // Upsert fallback using service_role client (safe for RLS)
    console.log(`[${FUNCTION_NAME}] Performing upsert into ${TABLE_NAME} onConflict=${UNIQUE_ON}`);
    let upsertRes = await supabaseAdmin.from(TABLE_NAME).upsert(payload, { onConflict: UNIQUE_ON }).select().single();
    if (upsertRes.error) {
      const msg = upsertRes.error?.message || '';
      const noUnique = msg.toLowerCase().includes('no unique or exclusion constraint') || msg.toLowerCase().includes('on conflict specification');
      if (noUnique) {
        // Fallback: manual find-or-insert
        console.warn(`[${FUNCTION_NAME}] No unique constraint for onConflict=${UNIQUE_ON}. Falling back to manual select+insert.`);
        const existing = await supabaseAdmin
          .from(TABLE_NAME)
          .select('*')
          .eq('direccion', payload.direccion)
          .eq('locality_id', payload.locality_id)
          .eq('usuario_id', payload.usuario_id)
          .maybeSingle();
        if (existing.data) {
          return jsonResponse(200, { result: existing.data }, origin || '*');
        }
        const insertRes = await supabaseAdmin.from(TABLE_NAME).insert(payload).select().single();
        if (insertRes.error) {
          console.error(`[${FUNCTION_NAME}] Insert failed after manual fallback`, insertRes.error);
          return jsonResponse(500, { error: 'Insert failed', details: insertRes.error }, origin || '*');
        }
        return jsonResponse(200, { result: insertRes.data }, origin || '*');
      }
      // Other errors
      console.error(`[${FUNCTION_NAME}] Upsert failed`, upsertRes.error);
      return jsonResponse(500, { error: 'Upsert failed', details: upsertRes.error }, origin || '*');
    }
    return jsonResponse(200, { result: upsertRes.data }, origin || '*');
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Internal error`, e?.message || e);
    return jsonResponse(500, { error: 'Internal server error', details: e?.message || e }, origin || '*');
  }

});

/*
  Deploy:
    supabase functions deploy create-address --project-ref <YOUR_PROJECT_REF>

  Test examples (replace <TOKEN> and <YOUR_PROJECT> accordingly):

  1) OPTIONS preflight
  curl -i -X OPTIONS 'https://<YOUR_PROJECT>.supabase.co/functions/v1/create-address' \
    -H 'Origin: http://localhost:4200' \
    -H 'Access-Control-Request-Method: POST'

  2) POST without Authorization -> should return 401
  curl -i -X POST 'https://<YOUR_PROJECT>.supabase.co/functions/v1/create-address' \
    -H 'Content-Type: application/json' \
    -d '{"p_direccion":"Calle Falsa 123","p_locality_id":"00000000-0000-0000-0000-000000000000"}'

  3) POST with Authorization (replace <TOKEN>)
  curl -i -X POST 'https://<YOUR_PROJECT>.supabase.co/functions/v1/create-address' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer <TOKEN>' \
    -d '{"p_direccion":"Calle Falsa 123","p_locality_id":"00000000-0000-0000-0000-000000000000","p_numero":"12"}'

*/
