// @ts-nocheck
// Supabase Edge Function: upsert-ticket-comment-attachment
// - Tries RPC first (if provided)
// - Fallback to upsert into table ticket_comment_attachments on conflict (comment_id, attachment_id)
// - CORS, Auth (Bearer), strict input validation with canonical p_* keys only

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function parseAllowedOrigins(): string[] | "*" {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  if (allowAll) return "*";
  const csv = Deno.env.get("ALLOWED_ORIGINS") || "";
  const arr = csv.split(",").map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : [];
}

function corsHeadersFor(origin: string | null, allowed: string[] | "*") {
  const h = new Headers();
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (allowed === "*") {
    h.set("Access-Control-Allow-Origin", origin || "*");
  } else {
    const ok = origin && allowed.includes(origin);
    if (ok) h.set("Access-Control-Allow-Origin", origin);
  }
  return h;
}

function isOriginAllowed(origin: string | null, allowed: string[] | "*") {
  if (allowed === "*") return true;
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
    return { ok: false, status: 400, error: "Missing required fields", details: { required: REQUIRED_FIELDS, optional: OPTIONAL_FIELDS, received_keys: keys } };
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
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error(`[${FUNCTION_NAME}] Missing env vars`);
      return json(500, { error: "Server misconfiguration" }, cors);
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${SERVICE_ROLE}` } },
    });

    const body = await req.json().catch(() => ({}));
    const v = validateInput(body);
    if (!(v as any).ok) {
      const err = v as any;
      return json(err.status, { error: err.error, details: err.details }, cors);
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
