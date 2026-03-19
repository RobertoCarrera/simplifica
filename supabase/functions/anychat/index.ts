// Edge Function: anychat (proxy to AnyChat public API)
// Path: /functions/v1/anychat[/*]
// Env required in Supabase: ANYCHAT_API_KEY
// Optional CORS env: ALLOWED_ORIGINS (comma-separated)
// Docs: https://documenter.getpostman.com/view/23223880/2sB2qi6x9D

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";
import { getClientIP } from "../_shared/security.ts";

const ANYCHAT_BASE = "https://api.anychat.one/public/v1";

function getCorsHeaders(origin?: string) {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllowed = origin && allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Vary": "Origin",
  } as Record<string, string>;
}

function isAllowedOrigin(origin?: string) {
  if (!origin) return true; // server-to-server
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowedOrigins.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limiting: 60 req/min per IP
  const ip = getClientIP(req);
  const rl = checkRateLimit(`anychat:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, ...getRateLimitHeaders(rl), "Content-Type": "application/json" },
    });
  }

  // Authentication — verify JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const token = authHeader.replace('Bearer ', '');
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = Deno.env.get("ANYCHAT_API_KEY") || "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANYCHAT_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    // Extract subpath after the function name, e.g., /functions/v1/anychat/contact → /contact
    const rawPath = url.pathname.replace(/^.*\/anychat/, "") || "/";
    // Normalize: resolve relative segments and collapse double slashes
    const pathAfter = new URL(rawPath, 'http://n').pathname;

    // Allow only specific AnyChat resources — STRICT exact segment match, no prefix
    const allowedSegments = ["/contact", "/conversation", "/message", "/chat", "/chats"];
    // Extract first path segment only (e.g. /contact/123 → /contact)
    const firstSegment = '/' + (pathAfter.split('/').filter(Boolean)[0] || '');
    const isAllowedPath = allowedSegments.includes(firstSegment);
    if (!isAllowedPath) {
      return new Response(JSON.stringify({ error: "Unsupported path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = new URL(ANYCHAT_BASE + pathAfter + (url.search || ""));

    const init: RequestInit = {
      method: req.method,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    };

    if (req.method === "POST" || req.method === "PUT") {
      const bodyText = await req.text();
      init.body = bodyText || undefined;
    }

    const upstream = await fetch(target, init);
    const text = await upstream.text();

    // Try to pass through JSON when possible
    const contentType = upstream.headers.get("Content-Type") || "application/json";
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": contentType },
    });
  } catch (e: any) {
    console.error('anychat error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
