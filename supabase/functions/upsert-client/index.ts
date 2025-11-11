// @ts-nocheck
// Clean implementation of upsert-client
// - Uses service role key (supabaseAdmin) for DB operations
// - Creates or updates clients in `clients` table
// - Creation requires `pcompanyid` (UUID)
// - Update (when `pid` provided) reads `company_id` from `clients` by id
// - Accepts legacy p_* keys (server-side normalization) to minimize frontend changes
// - CORS: allows only https://simplifica.digitalizamostupyme.es
// - OPTIONS preflight handled with 204 and CORS headers
// - Rate limiting via shared rate-limiter

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inline minimal rate limiter to avoid bundling issues with local imports
type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // ms epoch
};

const __rlStore: Map<string, { count: number; resetAt: number }> = new Map();

function checkRateLimit(key: string, limit = 100, windowMs = 60000): RateLimitResult {
  const now = Date.now();
  const entry = __rlStore.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    __rlStore.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }
  entry.count += 1;
  const allowed = entry.count <= limit;
  return { allowed, limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}

function getRateLimitHeaders(res: RateLimitResult) {
  return {
    'X-RateLimit-Limit': String(res.limit),
    'X-RateLimit-Remaining': String(res.remaining),
    'X-RateLimit-Reset': String(Math.ceil(res.resetAt / 1000)),
  } as Record<string, string>;
}

const FUNCTION_NAME = 'upsert-client';
const FUNCTION_VERSION = '2025-11-11-CLEAN';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOWED_ORIGIN = 'https://simplifica.digitalizamostupyme.es';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[upsert-client] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Map canonical p* keys to DB columns
const FIELD_MAP: Record<string, string> = {
  pid: 'id',
  pclienttype: 'client_type',
  pname: 'name',
  papellidos: 'apellidos',
  pemail: 'email',
  pphone: 'phone',
  pdni: 'dni',
  pbusinessname: 'business_name',
  pcifnif: 'cif_nif',
  ptradename: 'trade_name',
  plegalrepresentativename: 'legal_representative_name',
  plegalrepresentativedni: 'legal_representative_dni',
  pmetadata: 'metadata',
  pmercantileregistrydata: 'mercantile_registry_data',
  pcompanyid: 'company_id',
};

function baseCorsHeaders(origin?: string) {
  const h = new Headers();
  h.set('Content-Type', 'application/json');
  h.set('X-Function-Name', FUNCTION_NAME);
  h.set('X-Function-Version', FUNCTION_VERSION);
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  // Allow headers will be finalized per-request (reflecting Access-Control-Request-Headers)
  h.set('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info');
  h.set('Access-Control-Max-Age', '600');
  h.set('Access-Control-Allow-Credentials', 'true');
  if (origin) h.set('Access-Control-Allow-Origin', origin);
  return h;
}

function sanitizeString(input: string | undefined | null) {
  if (input == null) return input;
  let s = String(input);
  // Remove angle brackets and quotes that could be used in XSS
  s = s.replace(/[<>"'`]/g, '');
  // Remove control chars
  s = s.replace(/[\x00-\x1F\x7F]/g, '');
  s = s.trim();
  if (s.length > 500) s = s.substring(0, 500);
  return s;
}

function sanitizeJsonObject(obj: any) {
  if (obj == null) return obj;
  if (typeof obj !== 'object') return obj;
  try {
    const clone = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') clone[k] = sanitizeString(v);
      else if (typeof v === 'object') clone[k] = sanitizeJsonObject(v);
      else clone[k] = v;
    }
    return clone;
  } catch (_e) {
    return null;
  }
}

function isValidEmail(email: string) {
  if (!email) return false;
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;
  return re.test(email);
}

function isValidUUID(id: string) {
  if (!id) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id);
}

// Normalize incoming keys: accept legacy p_* keys and Spanish variants, map to canonical keys
function normalizeKeys(raw: Record<string, any>) {
  const out: Record<string, any> = {};
  const spanishMap: Record<string, string> = {
    pnombre: 'pname',
    papellidos: 'papellidos',
    pemail: 'pemail',
    ptelefono: 'pphone',
    pdni: 'pdni',
    pempresa: 'pbusinessname',
    p_cif_nif: 'pcifnif',
    p_cif: 'pcifnif',
    p_business_name: 'pbusinessname',
    p_id: 'pid',
    p_company_id: 'pcompanyid',
  };

  for (const [k, v] of Object.entries(raw)) {
    if (!k) continue;
    let key = k;
    // legacy underscore style: p_name -> pname
    if (key.startsWith('p_')) key = 'p' + key.substring(2).replace(/_/g, '');
    // remove accidental underscores after p: p_name -> pname
    if (key.startsWith('p') && key.includes('_')) key = key.replace(/_/g, '');
    key = key.toLowerCase();
    // Spanish friendly mapping
    if (spanishMap[key]) key = spanishMap[key];
    // Ensure starts with p
    if (!key.startsWith('p')) continue;
    out[key] = v;
  }
  return out;
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
  const isAllowedOrigin = !origin || origin === ALLOWED_ORIGIN;
  const headers = baseCorsHeaders(isAllowedOrigin && origin ? origin : undefined);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
    }
    const reqHeaders = req.headers.get('access-control-request-headers') || req.headers.get('Access-Control-Request-Headers');
    if (reqHeaders) headers.set('Access-Control-Allow-Headers', reqHeaders);
    return new Response(null, { status: 204, headers });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }), { status: 405, headers });
  }

  // Origin check
  if (!isAllowedOrigin) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
  }

  // Rate limit (per IP)
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const rateLimit: RateLimitResult = checkRateLimit(ip, 100, 60000);
  const rlHeaders = getRateLimitHeaders(rateLimit);
  for (const [k, v] of Object.entries(rlHeaders)) headers.set(k, String(v));
  if (!rateLimit.allowed) {
    console.warn(`[${FUNCTION_NAME}] Rate limit exceeded for IP: ${ip}`);
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), { status: 429, headers });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  // Normalize keys (server-side compatibility)
  const normalized = normalizeKeys(body);

  // After normalization, reject keys that don't start with 'p'
  const invalidKeys = Object.keys(normalized).filter(k => !k.startsWith('p'));
  if (invalidKeys.length) {
    return new Response(JSON.stringify({ error: 'Only canonical p* keys allowed (server accepts legacy p_* too)', invalid: invalidKeys }), { status: 400, headers });
  }

  // Sanitize and normalize values
  for (const k of Object.keys(normalized)) {
    const v = normalized[k];
    if (v == null) continue;
    if (typeof v === 'string') {
      const s = sanitizeString(v);
      if (k === 'pemail') normalized[k] = s.toLowerCase();
      else if (k === 'pmetadata' || k === 'pmercantileregistrydata') normalized[k] = s ? s : null;
      else normalized[k] = s.toUpperCase();
    } else if (typeof v === 'object') {
      normalized[k] = sanitizeJsonObject(v);
    } else {
      normalized[k] = v;
    }
  }

  // Ensure client type
  const rawType = normalized.pclienttype || 'INDIVIDUAL';
  normalized.pclienttype = String(rawType).toUpperCase() === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL';

  // Map normalized fields to DB row
  const row: Record<string, any> = {};
  for (const [pk, col] of Object.entries(FIELD_MAP)) {
    if (pk in normalized && normalized[pk] !== undefined) row[col] = normalized[pk];
  }

  try {
    // Update flow if pid present
    if (normalized.pid) {
      const pid = String(normalized.pid);
      if (!isValidUUID(pid)) return new Response(JSON.stringify({ error: 'Invalid pid format' }), { status: 400, headers });

      // Read company_id from existing client
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('clients')
        .select('company_id')
        .eq('id', pid)
        .is('deleted_at', null)
        .single();
      if (fetchErr || !existing) {
        return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers });
      }
      const companyId = existing.company_id;
      // Duplicate email check within same company, excluding this id
      if (row.email) {
        const { data: dup, error: dupErr } = await supabaseAdmin
          .from('clients')
          .select('id')
          .eq('company_id', companyId)
          .ilike('email', row.email)
          .is('deleted_at', null)
          .neq('id', pid)
          .limit(1);
        if (dupErr) console.warn('[upsert-client] dup check error', dupErr);
        if (dup && dup.length) {
          return new Response(JSON.stringify({ error: 'Duplicate email' }), { status: 409, headers });
        }
      }

      // Perform update
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('clients')
        .update(row)
        .eq('id', pid)
        .select()
        .single();
      if (updateErr) {
        console.error('[upsert-client] update error', updateErr);
        return new Response(JSON.stringify({ error: 'Update failed', details: updateErr.message }), { status: 500, headers });
      }
      // Return payload with `client` key to match frontend expectations; keep `data` for backward compatibility
      return new Response(JSON.stringify({ ok: true, client: updated, data: updated }), { status: 200, headers });
    }

    // Create flow
    const companyId = row.company_id || normalized.pcompanyid;
    if (!companyId || !isValidUUID(String(companyId))) {
      return new Response(JSON.stringify({ error: 'pcompanyid is required for create and must be a valid UUID' }), { status: 400, headers });
    }

    // Duplicate email check within company
    if (row.email) {
      const { data: dup2, error: dupErr2 } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('company_id', companyId)
        .ilike('email', row.email)
        .is('deleted_at', null)
        .limit(1);
      if (dupErr2) console.warn('[upsert-client] dup check error', dupErr2);
      if (dup2 && dup2.length) return new Response(JSON.stringify({ error: 'Duplicate email' }), { status: 409, headers });
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('clients')
      .insert(row)
      .select()
      .single();
    if (insertErr) {
      console.error('[upsert-client] insert error', insertErr);
      return new Response(JSON.stringify({ error: 'Insert failed', details: insertErr.message }), { status: 500, headers });
    }
    // Return payload with `client` key to match frontend expectations; keep `data` for backward compatibility
    return new Response(JSON.stringify({ ok: true, client: inserted, data: inserted }), { status: 201, headers });
  } catch (e) {
    console.error('[upsert-client] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(e) }), { status: 500, headers });
  }
});

