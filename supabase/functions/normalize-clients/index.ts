// @ts-nocheck
// Supabase Edge Function: normalize-clients
// PRODUCTION-READY: Admin-only bulk normalization with security controls
// Purpose: server-side normalization of existing clients for a given company
// - Normalizes string fields: name/apellidos/dni -> UPPERCASE; email -> lowercase
// - Normalizes address JSON string fields to UPPERCASE if present
// - Requires Authorization: Bearer <JWT> and resolves caller's company_id from users table
// - SECURITY: Only admin/owner roles can execute
// - Uses service role key for DB write operations
// - Processes clients in pages to avoid memory issues
// - Input sanitization to prevent injection attacks
// - Rate limiting: 10 requests per minute per IP (resource-intensive operation)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= RATE LIMITER (Inline) =============
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

function checkRateLimit(
  ip: string,
  limit: number = 100,
  windowMs: number = 60000
): RateLimitResult {
  const now = Date.now();
  const key = `ratelimit:${ip}`;
  
  let entry = rateLimitMap.get(key);
  
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs
    };
    rateLimitMap.set(key, entry);
  }
  
  entry.count++;
  
  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);
  
  return {
    allowed,
    limit,
    remaining,
    resetAt: entry.resetAt
  };
}

function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
    'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString()
  };
}
// ============= END RATE LIMITER =============

const FUNCTION_NAME = 'normalize-clients';
const FUNCTION_VERSION = '2025-10-06-PRODUCTION';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s=>s.trim()).filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function corsHeaders(origin) {
  const h = new Headers();
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (ALLOW_ALL_ORIGINS) {
    h.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
    if (ok) h.set('Access-Control-Allow-Origin', ok);
  }
  h.set('Content-Type', 'application/json');
  h.set('X-Function-Name', FUNCTION_NAME);
  h.set('X-Function-Version', FUNCTION_VERSION);
  return h;
}

function isOriginAllowed(origin) {
  if (!origin) return true; // server-to-server
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

// Security: Sanitize string
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.trim()
    .replace(/[<>\"'`]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .substring(0, 500);
}

serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
  const headers = corsHeaders(origin);

  // Rate limiting - stricter for resource-intensive operation (10 req/min)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
             req.headers.get('x-real-ip') || 
             'unknown';
  const rateLimit = checkRateLimit(ip, 10, 60000); // 10 req/min (lower limit for bulk operations)
  
  const rateLimitHeaders = getRateLimitHeaders(rateLimit);
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    headers.set(key, value);
  }
  
  if (!rateLimit.allowed) {
    console.warn(`[${FUNCTION_NAME}] Rate limit exceeded for IP: ${ip}`);
    return new Response(
      JSON.stringify({ 
        error: 'Rate limit exceeded for bulk operation. Please try again later.',
        limit: rateLimit.limit,
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      }), 
      { status: 429, headers }
    );
  }

  if (req.method === 'OPTIONS') {
    if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
    }
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed', allowed: ['POST','OPTIONS'] }), { status: 405, headers });
  if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), { status: 401, headers });
    const token = match[1];

    // Validate token
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    const authUserId = userData.user.id;
    
    // Security: verify user email is confirmed
    if (!userData.user.email_confirmed_at && !userData.user.confirmed_at) {
      return new Response(JSON.stringify({ error: 'Email not confirmed' }), { status: 403, headers });
    }

    // Resolve company_id and role
    let company_id = null;
    let userRole = null;
    try {
      const { data: urow, error: uerr } = await supabaseAdmin.from('users').select('company_id, role').eq('auth_user_id', authUserId).limit(1).maybeSingle();
      if (!uerr && urow && urow.company_id) {
        company_id = urow.company_id;
        userRole = urow.role;
      }
    } catch (e) {
      console.error('[normalize-clients] Error resolving user:', e);
    }
    if (!company_id) {
      return new Response(JSON.stringify({ error: 'Unable to determine company for authenticated user' }), { status: 403, headers });
    }
    
    // Security: only admin/owner can normalize all clients
    if (userRole !== 'admin' && userRole !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only admins/owners can normalize all clients' }), { status: 403, headers });
    }

    // Parse optional body parameters
    const body = await req.json().catch(()=>({}));
    if (body && body.p_company_id && String(body.p_company_id) !== String(company_id)) {
      return new Response(JSON.stringify({ error: 'Not allowed to normalize another company' }), { status: 403, headers });
    }

    // Pagination parameters
    const pageSize = 500;
    let offset = 0;
    let totalProcessed = 0;
    const errors = [];

    while (true) {
      const { data: rows, error: fetchErr } = await supabaseAdmin.from('clients')
        .select('id,name,apellidos,email,phone,dni,metadata')
        .eq('company_id', company_id)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (fetchErr) {
        console.error('[normalize-clients] Fetch error:', fetchErr);
        errors.push({ stage: 'fetch', details: fetchErr.message || fetchErr });
        break;
      }
      if (!rows || rows.length === 0) break;

      const updates = [];
      for (const r of rows) {
        const upd = { id: r.id };
        let changed = false;
        
        if (typeof r.name === 'string') {
          const v = sanitizeString(r.name).toUpperCase();
          if (v !== r.name) { upd.name = v; changed = true; }
        }
        if (typeof r.apellidos === 'string') {
          const v = sanitizeString(r.apellidos).toUpperCase();
          if (v !== r.apellidos) { upd.apellidos = v; changed = true; }
        }
        if (typeof r.email === 'string') {
          const v = sanitizeString(r.email).toLowerCase();
          if (v !== r.email) { upd.email = v; changed = true; }
        }
        if (typeof r.dni === 'string') {
          const v = sanitizeString(r.dni).toUpperCase();
          if (v !== r.dni) { upd.dni = v; changed = true; }
        }
        // metadata normalization
        if (r.metadata && typeof r.metadata === 'object') {
          let modified = false;
          const meta = { ...r.metadata };
          for (const [mk, mv] of Object.entries(meta)) {
            if (typeof mv === 'string') {
              const nv = sanitizeString(mv).toUpperCase();
              if (nv !== mv) { meta[mk] = nv; modified = true; }
            }
          }
          if (modified) { upd.metadata = meta; changed = true; }
        }
        
        if (changed) {
          upd.updated_at = new Date().toISOString();
          updates.push(upd);
        }
      }

      if (updates.length > 0) {
        const { data: upserted, error: upErr } = await supabaseAdmin.from('clients').upsert(updates).select('id');
        if (upErr) {
          console.error('[normalize-clients] Upsert error:', upErr);
          errors.push({ stage: 'upsert', details: upErr.message || upErr, items: updates.length });
        } else {
          totalProcessed += (upserted && Array.isArray(upserted) ? upserted.length : updates.length);
        }
      }

      // advance
      offset += pageSize;
      if (rows.length < pageSize) break;
    }

    return new Response(JSON.stringify({ ok: true, company_id, total_processed: totalProcessed, errors }), { status: 200, headers });

  } catch (e) {
    console.error('[normalize-clients] Unexpected error:', e);
    const h = corsHeaders(undefined);
    return new Response(JSON.stringify({ error: 'Internal error', details: String(e) }), { status: 500, headers: h });
  }
});
