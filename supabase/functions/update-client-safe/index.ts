// @ts-nocheck
// Supabase Edge Function: update-client-safe
// Pattern: Deno serve + supabase-js@2 (esm.sh)
// - Tries RPC first, then falls back to upsert with onConflict
// - Strict input validation with canonical p_* fields
// - Auth required via Authorization: Bearer <JWT>
// - CORS with configurable origins

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ====== CONFIG (fill placeholders) ======
const FUNCTION_NAME = "update-client-safe"; // functions/v1/update-client-safe
const RPC_NAME = "update_customer_dev"; // leave empty string if none
const TABLE_NAME = "clients";
const UNIQUE_ON = "id"; // conflict target
const REQUIRED_FIELDS = ["p_id"]; // only id is strictly required; allow partial updates
// Keep optionals aligned with existing columns in public.clients
// Include legacy optional fields sent by frontend (we'll ignore them in DB mapping)
const OPTIONAL_FIELDS = [
  "p_name",
  "p_apellidos",
  "p_email",
  "p_phone",
  "p_dni",
  // legacy/ignored: accepted to avoid 400, but not mapped to DB
  "p_fecha_nacimiento",
  "p_profesion",
  "p_empresa",
  "p_avatar_url",
  "p_direccion_id"
];
const NUMERIC_ONLY_FIELD = ""; // e.g., "p_postal_code" if needed

// Canonical mapping p_* -> DB columns
const FIELD_MAP = {
  p_id: "id",
  p_name: "name",
  p_apellidos: "apellidos",
  p_email: "email",
  p_phone: "phone",
  p_dni: "dni",
};

// ====== Helpers ======
function corsHeaders(origin: string | null) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "true").toLowerCase() === "true";
  const allowedCsv = Deno.env.get("ALLOWED_ORIGINS") || "";
  const allowedList = allowedCsv.split(",").map(s => s.trim()).filter(Boolean);

  const isAllowed = allowAll || (!!origin && allowedList.includes(origin));

  const h = new Headers({
    "Content-Type": "application/json",
    "Vary": "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
    // Keep minimal required set per contract
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
  });
  // Always include A-C-A-Origin so browsers don't block even on errors
  if (origin) {
    // Echo caller origin to support credentials
    h.set("Access-Control-Allow-Origin", origin);
  } else if (allowAll) {
    h.set("Access-Control-Allow-Origin", "*");
  }

  return { allowed: isAllowed, headers: h };
}

function json(body: any, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

function validatePayload(payload: any) {
  const keys = Object.keys(payload || {});
  const allAllowed = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

  // Only allow canonical p_* keys
  for (const k of keys) {
    if (!allAllowed.includes(k)) {
      return { ok: false, error: json({ error: `Unexpected field: ${k}` }, 400) };
    }
  }

  // Check required
  const missing = REQUIRED_FIELDS.filter(k => !(k in payload));
  if (missing.length) {
    return {
      ok: false,
      error: json({
        error: "Missing required fields",
        details: {
          required: REQUIRED_FIELDS,
          optional: OPTIONAL_FIELDS,
          received_keys: keys,
        }
      }, 400)
    };
  }

  // Normalize numeric-only field if configured
  if (NUMERIC_ONLY_FIELD && payload[NUMERIC_ONLY_FIELD]) {
    payload[NUMERIC_ONLY_FIELD] = String(payload[NUMERIC_ONLY_FIELD]).replace(/\D+/g, "");
  }

  // Must contain at least one updatable field beyond p_id
  const updatableProvided = keys.some(k => k !== 'p_id' && OPTIONAL_FIELDS.includes(k));
  if (!updatableProvided) {
    return { ok: false, error: json({ error: "No updatable fields provided", details: { required: REQUIRED_FIELDS, optional: OPTIONAL_FIELDS, received_keys: keys } }, 400) };
  }

  return { ok: true, payload };
}

function mapToDb(payload: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [pk, col] of Object.entries(FIELD_MAP)) {
    if (payload.hasOwnProperty(pk)) out[col] = payload[pk];
  }
  return out;
}

// ====== Handler ======
serve(async (req) => {
  const origin = req.headers.get("Origin");
  const { allowed, headers } = corsHeaders(origin);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  if (!allowed) {
    return json({ error: "Origin not allowed" }, 403, headers);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed", allowed: ["POST", "OPTIONS"] }, 405, headers);
  }

  // Auth check
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return json({ error: "Missing or invalid Authorization header" }, 401, headers);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing env SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "Server misconfiguration" }, 500, headers);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  });

  let payload: any;
  try {
    payload = await req.json();
  } catch (e) {
    return json({ error: "Invalid JSON body" }, 400, headers);
  }

  const v = validatePayload(payload);
  if (!v.ok) return v.error;

  // Try RPC first (if provided)
  if (RPC_NAME) {
    try {
      console.log(`[${FUNCTION_NAME}] Trying RPC: ${RPC_NAME}`);
      const { data, error } = await supabaseAdmin.rpc(RPC_NAME, {
        customer_id: payload.p_id,
        p_nombre: payload.p_name,
        p_apellidos: payload.p_apellidos ?? null,
        p_email: payload.p_email ?? null,
        p_telefono: payload.p_phone ?? null,
        p_dni: payload.p_dni ?? null,
        target_user_id: null, // not needed under service_role
      });
      if (error) throw error;
      // If RPC returns boolean success
      if (data === true) {
        console.log(`[${FUNCTION_NAME}] RPC success, fetching row`);
        const { data: row, error: selErr } = await supabaseAdmin
          .from(TABLE_NAME)
          .select("*")
          .eq("id", payload.p_id)
          .single();
        if (selErr) throw selErr;
        return json({ result: row }, 200, headers);
      }
      // If RPC returns the updated row
      if (data && typeof data === "object") {
        return json({ result: data }, 200, headers);
      }
      console.warn(`[${FUNCTION_NAME}] RPC returned unexpected result, falling back to upsert`);
    } catch (e) {
      console.error(`[${FUNCTION_NAME}] RPC failed`, e);
      // Fall through to upsert
    }
  }

  // Fallback: UPSERT with onConflict = id
  try {
    console.log(`[${FUNCTION_NAME}] Performing upsert fallback on ${TABLE_NAME}`);
    const row = mapToDb(payload);
    // Prefetch existing to carry NOT NULL columns (e.g., company_id, name) into the upsert
    const { data: existing, error: selErr } = await supabaseAdmin
      .from(TABLE_NAME)
      .select("id, company_id, name, apellidos, email, phone, dni")
      .eq("id", row.id)
      .maybeSingle();
    if (selErr) {
      console.error(`[${FUNCTION_NAME}] Select existing failed`, selErr);
      throw selErr;
    }
    if (!existing) {
      console.warn(`[${FUNCTION_NAME}] No existing row for id=${row.id}; refusing to insert without required fields`);
      return json({
        error: "Record not found for update",
        details: {
          id: row.id,
          hint: "This endpoint updates existing clients only."
        }
      }, 400, headers);
    }

    // If nothing actually changes, return the current row without touching DB
    let hasChanges = false;
    for (const [pk, col] of Object.entries(FIELD_MAP)) {
      if (pk === 'p_id') continue;
      if (row.hasOwnProperty(col)) {
        const newVal = (row as any)[col];
        const oldVal = (existing as any)[col];
        if (newVal !== oldVal) { hasChanges = true; break; }
      }
    }
    if (!hasChanges) {
      console.log(`[${FUNCTION_NAME}] No changes detected; skipping upsert`);
      return json({ result: existing }, 200, headers);
    }

    const merged = { ...existing, ...row };
    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(merged, { onConflict: UNIQUE_ON })
      .select("*")
      .single();
    if (upsertErr) throw upsertErr;
    return json({ result: upserted }, 200, headers);
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Upsert failed`, e);
    const errBody: any = { error: "Internal error performing upsert" };
    if (e && typeof e === 'object') {
      errBody.code = e.code ?? undefined;
      errBody.message = e.message ?? undefined;
      errBody.details = e.details ?? undefined;
      errBody.hint = e.hint ?? undefined;
    }
    return json(errBody, 500, headers);
  }
});
