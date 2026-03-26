// @ts-nocheck
// ================================================================
// Edge Function: holded-proxy
// ================================================================
// Authenticated proxy: allows the Angular frontend to read data
// from Holded WITHOUT exposing the API key to the client.
//
// POST body:
//   { company_id: string, resource: string, params?: Record<string, string>,
//     method?: 'GET'|'POST'|'PUT', payload?: unknown }
//
// resource examples:
//   "documents/salesreceipt"  → list salesreceipts
//   "documents/invoice"       → list invoices
//   "documents/estimate"      → list/create estimates
//   "contacts"                → list/create contacts
//   "products"                → create/update products
//
// Security:
//   - JWT auth required (any member of the company)
//   - API key retrieved server-side, never sent to client
//   - Only GET/POST/PUT allowed; DELETE never forwarded
//   - Only whitelisted resources allowed (SSRF prevention)
// ================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
/* ── env ─────────────────────────────────────────────────── */ const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[holded-proxy] ENCRYPTION_KEY must be at least 32 characters');
}
/* ── AES-256-GCM decrypt ─────────────────────────────────── */ async function decrypt(encryptedBase64) {
  try {
    const keyData = new TextEncoder().encode(ENCRYPTION_KEY.slice(0, 32));
    const key = await crypto.subtle.importKey('raw', keyData, {
      name: 'AES-GCM'
    }, false, [
      'decrypt'
    ]);
    const combined = Uint8Array.from(atob(encryptedBase64), (c)=>c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv
    }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch  {
    return '';
  }
}
/* ── Whitelist of allowed Holded resource paths ─────────── */ // Prevents SSRF by only allowing known Holded invoicing endpoints
const ALLOWED_RESOURCES = new Set([
  'documents/salesreceipt',
  'documents/invoice',
  'documents/estimate',
  'documents/salesorder',
  'documents/proform',
  'contacts',
  'products',
  'services'
]);
// Resources that accept write operations (POST/PUT)
const MUTABLE_RESOURCES = new Set([
  'contacts',
  'products',
  'services',
  'documents/estimate'
]);
// Allowed HTTP methods to forward to Holded
const ALLOWED_METHODS = new Set([
  'GET',
  'POST',
  'PUT'
]);
const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1';
/* ── main handler ─────────────────────────────────────────── */ serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
  };
  // Rate limit: 60 req/min per IP
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`holded-proxy:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({
      error: 'Too many requests'
    }), {
      status: 429,
      headers: {
        ...headers,
        ...getRateLimitHeaders(rl)
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers
    });
  }
  try {
    /* ── 1. Admin client (service role) ──────────────────── */ // Created early so it can be reused for auth check AND DB queries.
    // Using the service role key guarantees the correct apikey is sent
    // when calling auth.getUser(), avoiding mismatches from stale
    // SUPABASE_ANON_KEY custom secrets.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    /* ── 2. Auth ──────────────────────────────────────────── */ const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[holded-proxy] Missing Authorization header');
      return new Response(JSON.stringify({
        error: 'Missing Authorization'
      }), {
        status: 401,
        headers
      });
    }
    const token = authHeader.slice('Bearer '.length);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      console.error('[holded-proxy] getUser failed:', authError?.message ?? 'no user returned');
      return new Response(JSON.stringify({
        error: 'Invalid or expired token'
      }), {
        status: 401,
        headers
      });
    }
    /* ── 2. Parse and validate request ───────────────────── */ const body = await req.json();
    const { company_id, resource, resourcePath, params, method: reqMethod = 'GET', payload } = body;
    if (!company_id || !resource) {
      return new Response(JSON.stringify({
        error: 'company_id and resource are required'
      }), {
        status: 400,
        headers
      });
    }
    // SSRF protection: only allow whitelisted resource paths
    if (!ALLOWED_RESOURCES.has(resource)) {
      return new Response(JSON.stringify({
        error: 'Resource not allowed'
      }), {
        status: 400,
        headers
      });
    }
    const httpMethod = reqMethod.toUpperCase();
    if (!ALLOWED_METHODS.has(httpMethod)) {
      return new Response(JSON.stringify({
        error: 'Method not allowed'
      }), {
        status: 400,
        headers
      });
    }
    if ((httpMethod === 'POST' || httpMethod === 'PUT') && !MUTABLE_RESOURCES.has(resource)) {
      return new Response(JSON.stringify({
        error: 'Mutations not allowed for this resource'
      }), {
        status: 400,
        headers
      });
    }
    /* ── 3. Verify user is a member of the company ────────── */ const { data: membership } = await admin.from('users').select('id').eq('auth_user_id', user.id).eq('company_id', company_id).maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({
        error: 'No eres miembro de esta empresa'
      }), {
        status: 403,
        headers
      });
    }
    /* ── 4. Get Holded integration ────────────────────────── */ const { data: integration } = await admin.from('holded_integrations').select('api_key_encrypted, is_active').eq('company_id', company_id).maybeSingle();
    if (!integration?.is_active) {
      return new Response(JSON.stringify({
        error: 'Holded no está activo para esta empresa'
      }), {
        status: 422,
        headers
      });
    }
    /* ── 5. Decrypt API key ───────────────────────────────── */ const apiKey = await decrypt(integration.api_key_encrypted);
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'No se pudo descifrar la API Key de Holded'
      }), {
        status: 500,
        headers
      });
    }
    /* ── 6. Build and make Holded request ────────────────── */ // Validate resourcePath if provided: must start with whitelisted resource
    const effectivePath = resourcePath ?? resource;
    if (resourcePath) {
      const baseOfPath = resourcePath.split('/').slice(0, 2).join('/');
      if (!ALLOWED_RESOURCES.has(baseOfPath)) {
        return new Response(JSON.stringify({
          error: 'Resource path not allowed'
        }), {
          status: 400,
          headers
        });
      }
    }
    const qs = params && Object.keys(params).length > 0 ? '?' + new URLSearchParams(params).toString() : '';
    const holdedUrl = `${HOLDED_BASE}/${effectivePath}${qs}`;
    const holdedRes = await fetch(holdedUrl, {
      method: httpMethod,
      headers: {
        'key': apiKey,
        'Accept': 'application/json',
        ...payload ? {
          'Content-Type': 'application/json'
        } : {}
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const data = await holdedRes.json().catch(()=>null);
    if (!holdedRes.ok) {
      console.error('[holded-proxy] Holded error:', holdedRes.status, JSON.stringify(data));
      return new Response(JSON.stringify({
        error: `Holded respondió ${holdedRes.status}`,
        detail: data
      }), {
        status: holdedRes.status,
        headers
      });
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('[holded-proxy] Error:', err);
    return new Response(JSON.stringify({
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers
    });
  }
});
