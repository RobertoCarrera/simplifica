// @ts-nocheck
// Supabase Edge Function: get-csrf-token
// Purpose: Generate CSRF tokens for authenticated users
// Returns a time-limited CSRF token that must be included in subsequent requests

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= CSRF PROTECTION (Inline) =============
const CSRF_TOKEN_LIFETIME = 3600000; // 1 hour

async function generateHmac(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function generateCsrfToken(userId: string): Promise<string> {
  const secret = Deno.env.get('CSRF_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) {
    throw new Error('CSRF_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  
  const timestamp = Date.now().toString();
  const payload = `${userId}:${timestamp}`;
  const hmac = await generateHmac(payload, secret);
  
  return btoa(`${payload}:${hmac}`);
}
// ============= END CSRF PROTECTION =============

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

const FUNCTION_NAME = 'get-csrf-token';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s=>s.trim()).filter(Boolean);

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function corsHeaders(origin) {
  const h = new Headers();
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (ALLOW_ALL_ORIGINS) {
    h.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
    if (ok) h.set('Access-Control-Allow-Origin', ok);
  }
  h.set('Content-Type', 'application/json');
  return h;
}

serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
  const headers = corsHeaders(origin);

  // Rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
             req.headers.get('x-real-ip') || 
             'unknown';
  const rateLimit = checkRateLimit(ip, 100, 60000);
  
  const rateLimitHeaders = getRateLimitHeaders(rateLimit);
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    headers.set(key, value);
  }
  
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }), 
      { status: 429, headers }
    );
  }

  // OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed: ['GET','OPTIONS'] }), 
      { status: 405, headers }
    );
  }

  try {
    // Validate JWT token
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization Bearer token' }), 
        { status: 401, headers }
      );
    }

    const token = match[1];
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }), 
        { status: 403, headers }
      );
    }

    const userId = userData.user.id;

    // Generate CSRF token
    const csrfToken = await generateCsrfToken(userId);

    return new Response(
      JSON.stringify({ 
        ok: true,
        csrfToken,
        expiresIn: 3600 // 1 hour in seconds
      }), 
      { status: 200, headers }
    );

  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Error:`, e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: e?.message || String(e) }), 
      { status: 500, headers }
    );
  }
});
