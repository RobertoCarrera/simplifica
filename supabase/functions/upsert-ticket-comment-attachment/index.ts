// @ts-nocheck
// Supabase Edge Function: upsert-ticket-comment-attachment
// - Tries RPC first (if provided)
// - Fallback to upsert into table ticket_comment_attachments on conflict (comment_id, attachment_id)
// - CORS, Auth (Bearer), strict input validation with canonical p_* keys only

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";
import { getClientIP } from "../_shared/security.ts";

// Config
const FUNCTION_NAME = "upsert-ticket-comment-attachment";
const RPC_NAME = ""; // no RPC for now
const TABLE_NAME = "ticket_comment_attachments";
const UNIQUE_ON = "comment_id,attachment_id"; // composite
const REQUIRED_FIELDS = ["p_comment_id", "p_attachment_id"]; 
const OPTIONAL_FIELDS: string[] = [];
const NUMERIC_ONLY_FIELD = ""; // none

// Map canonical input -> DB columns
const FIELD_MAP: Record<string, string> = {
  p_comment_id: "comment_id",
  p_attachment_id: "attachment_id",
};

// Helpers
const json = (status: number, body: any, headers: Headers = new Headers()) => {
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
};

function parseAllowedOrigins(): string[] {
  const csv = Deno.env.get("ALLOWED_ORIGINS") || "";
  const arr = csv.split(",").map(s => s.trim()).filter(Boolean);
  return arr;
}

function corsHeadersFor(origin: string | null, allowed: string[]) {
  const h = new Headers();
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (origin && allowed.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
  }
  return h;
}

function isOriginAllowed(origin: string | null, allowed: string[]) {
  return !!(origin && allowed.includes(origin));
}

function validateInput(body: Record<string, any>) {
  const keys = Object.keys(body || {});
  const invalid = keys.filter(k => !k.startsWith("p_"));
  if (invalid.length) {
    return { ok: false, status: 400, error: `Only canonical p_* keys are allowed. Invalid: ${invalid.join(", ")}` };
  }
  const missing = REQUIRED_FIELDS.filter(k => !(k in body));
  if (missing.length) {
    return { ok: false, status: 400, error: "Missing required fields" };
  }
  return { ok: true } as const;
}

function mapToDb(body: Record<string, any>) {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (FIELD_MAP[k]) row[FIELD_MAP[k]] = v;
  }
  return row;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const allowed = parseAllowedOrigins();
  const cors = corsHeadersFor(origin, allowed);

  if (req.method === "OPTIONS") {
    // Preflight
    return new Response(null, { status: 200, headers: cors });
  }

  // Rate limiting: 30 req/min per IP (ticket comment attachment upsert)
  const ip = getClientIP(req);
  const rl = checkRateLimit(`upsert-ticket-comment-attachment:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return json(429, { error: "Too many requests" }, new Headers({ ...Object.fromEntries(cors), ...getRateLimitHeaders(rl) }));
  }

  if (!isOriginAllowed(origin, allowed)) {
    return json(403, { error: "Origin not allowed" }, cors);
  }

  if (req.method !== "POST") {
    const h = new Headers(cors);
    h.set("Allow", "POST, OPTIONS");
    return json(405, { error: "Method not allowed", allowed: ["POST","OPTIONS"] }, h);
  }

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return json(401, { error: "Missing Authorization: Bearer <JWT>" }, cors);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE || !SUPABASE_ANON_KEY) {
      console.error(`[${FUNCTION_NAME}] Missing env vars`);
      return json(500, { error: "Server misconfiguration" }, cors);
    }

    // Validate the JWT token
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !user) {
      return json(401, { error: "Invalid or expired token" }, cors);
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const v = validateInput(body);
    if (!(v as any).ok) {
      const err = v as any;
      return json(err.status, { error: err.error }, cors);
    }

    // UUID validation for p_comment_id and p_attachment_id before DB queries
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(String(body.p_comment_id ?? ''))) {
      return json(400, { error: "Invalid p_comment_id format" }, cors);
    }
    if (!UUID_RE.test(String(body.p_attachment_id ?? ''))) {
      return json(400, { error: "Invalid p_attachment_id format" }, cors);
    }

    // Authorization: verify the comment belongs to a ticket in the user's company
    const { data: userProfile } = await client
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single();
    if (!userProfile?.company_id) {
      return json(403, { error: 'Unauthorized' }, cors);
    }
    const commentId = body.p_comment_id;
    const { data: comment } = await client
      .from('ticket_comments')
      .select('id, ticket:tickets(company_id)')
      .eq('id', commentId)
      .single();
    const ticketCompanyId = (comment as any)?.ticket?.company_id;
    if (!comment || ticketCompanyId !== userProfile.company_id) {
      return json(403, { error: 'Comment not accessible' }, cors);
    }

    // Normalize numeric-only field if any
    if (NUMERIC_ONLY_FIELD && body[NUMERIC_ONLY_FIELD]) {
      body[NUMERIC_ONLY_FIELD] = String(body[NUMERIC_ONLY_FIELD]).replace(/\D+/g, "");
    }

    const row = mapToDb(body);

    // Try RPC first if provided
    if (RPC_NAME) {
      try {
        const { data, error } = await client.rpc(RPC_NAME, row).select().single();
        if (error) throw error;
        return json(200, { result: data }, cors);
      } catch (e) {
        console.warn(`[${FUNCTION_NAME}] RPC failed, falling back to upsert`, e?.message || e);
      }
    }

    // Fallback: upsert
    const { data, error } = await client
      .from(TABLE_NAME)
      .upsert(row, { onConflict: UNIQUE_ON })
      .select()
      .single();

    if (error) {
      console.error(`[${FUNCTION_NAME}] Upsert error:`, error.message || error);
      return json(500, { error: "Upsert failed" }, cors);
    }

    return json(200, { result: data }, cors);
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Unexpected error:`, e?.message || e);
    return json(500, { error: "Internal error" }, cors);
  }
});
