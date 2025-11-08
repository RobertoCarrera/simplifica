// Edge Function: import-customers (Deno serve pattern)
// Deploy path: functions/v1/import-customers
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// CORS controlled by: ALLOW_ALL_ORIGINS (true/false), ALLOWED_ORIGINS (comma-separated)
// Version: 2025-10-06-PRODUCTION (Added sanitization and validation)

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Security: Sanitize string input
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;
  return str.trim()
    .replace(/[<>\"'`]/g, '') // Remove HTML/script injection chars
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 500); // Max length protection
}

// Security: Validate email format
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  return emailRegex.test(email.trim().toLowerCase());
}

function getCorsHeaders(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowedOrigins.includes(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : (allowAll ? "*" : ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  } as Record<string, string>;
}

function isAllowedOrigin(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  if (allowAll) return true;
  if (!origin) return true; // server-to-server
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowedOrigins.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    try { console.log("import-customers OPTIONS preflight", { origin }); } catch {}
    return new Response("ok", { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  }

  // Simple GET health check
  if (req.method === "GET") {
    try { console.log("import-customers GET health", { origin }); } catch {}
    return new Response(JSON.stringify({ ok: true, name: "import-customers" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Enforce allowed origins
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", allowed: ["GET", "POST", "OPTIONS"] }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("URL_SUPABASE") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing Supabase env configuration" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Require Authorization: Bearer <jwt>
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization Bearer token required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate token and derive user's company_id
    const token = authHeader.split(" ")[1];
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // Security: verify user email is confirmed
    if (!userData.user.email_confirmed_at && !userData.user.confirmed_at) {
      return new Response(JSON.stringify({ error: "Email not confirmed. Please verify your email before importing customers." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const authUserId = userData.user.id;

    let authoritativeCompanyId: string | null = null;
    try {
      const { data: appUsers, error: appUsersErr } = await supabaseAdmin
        .from("users")
        .select("company_id")
        .eq("auth_user_id", authUserId)
        .limit(1);
      if (appUsersErr) console.error("import-customers: users mapping error", appUsersErr);
      if (appUsers && appUsers.length) authoritativeCompanyId = appUsers[0].company_id || null;
    } catch (mapErr) {
      console.error("import-customers: users mapping exception", mapErr);
    }

    if (!authoritativeCompanyId) {
      return new Response(JSON.stringify({ error: "Authenticated user has no associated company (forbidden)" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await req.json().catch(() => ({}));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: [], errors: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("import-customers: begin", { count: rows.length, companyId: authoritativeCompanyId });
    const prepared: any[] = [];
    const errors: any[] = [];

    // Helper: try to extract a value from row by checking common variants
    const findAnyField = (obj: any, patterns: RegExp[]) => {
      if (!obj || typeof obj !== 'object') return null;
      // direct keys first
      for (const p of patterns) {
        for (const k of Object.keys(obj)) {
          if (p.test(k) && obj[k] != null && String(obj[k]).toString().trim() !== '') return obj[k];
        }
      }
      // also try lowercased keys
      const lowMap: Record<string, any> = {};
      for (const k of Object.keys(obj)) lowMap[k.toLowerCase()] = obj[k];
      for (const p of patterns) {
        for (const k of Object.keys(lowMap)) {
          if (p.test(k) && lowMap[k] != null && String(lowMap[k]).toString().trim() !== '') return lowMap[k];
        }
      }
      return null;
    };

  // Detect business vs individual based on fields/keywords, preferring 'individual' unless we have strong signals
    const normalizeStr = (s: string) => (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .toLowerCase().trim().replace(/\s+/g, ' ');
    const isValidCIF = (val?: string | null) => {
      if (!val) return false;
      const v = String(val).toUpperCase().trim();
      // Simple but effective CIF pattern: Letter + 8 digits (covers most CIFs)
      return /^[A-Z]\d{8}$/.test(v);
    };
    const hasBizKeywords = (s?: string | null) => !!(s && /S\.L\.|S\.A\.|S\.L\.U\.|S\.COOP|LIMITED|LTD|INC|CORP/i.test(String(s)));
    const detectClientType = (row: any): 'business' | 'individual' => {
      const name = String(row.name || row.nombre || '');
      const surname = String(row.surname || row.apellidos || row.last_name || '');
      const businessName = String(row.business_name || findAnyField(row, [/business.*name/i, /razon.*social/i, /company/i, /empresa/i]) || '');
      const cif = row.cif_nif || row.cif || row.nif_empresa || null;
      const strongBiz = isValidCIF(cif) || hasBizKeywords(businessName);
      const probablePersonalCompany = businessName && normalizeStr(businessName) === normalizeStr(`${name} ${surname}`);
      // Rule:
      // - If explicit business and strongBiz and not a personal-company name -> business
      // - Else if strongBiz (CIF or keywords) -> business
      // - Otherwise -> individual
      if (strongBiz && !probablePersonalCompany) return 'business';
      return 'individual';
    };

  for (const r of rows) {
      // tolerant lookup: accept keys like 'bill_to:email', 'ship_to:email', 'bill_to:first_name', etc.
      let email = r.email || r.correo || findAnyField(r, [/(:|\b)email$/i, /^email$/i, /:correo$/i, /correo$/i]) || null;
      let name = r.name || r.nombre || findAnyField(r, [/(:|\b)first_name$/i, /(:|\b)name$/i, /first_name$/i, /name$/i]) || "";
      let surname = r.surname || r.apellidos || r.last_name || findAnyField(r, [/(:|\b)last_name$/i, /(:|\b)last$/i, /last_name$/i, /apellidos$/i]) || "";
      let phone = r.phone || r.telefono || findAnyField(r, [/(:|\b)phone$/i, /telefono$/i, /tel$/i]) || null;
      let dni = r.dni || r.nif || findAnyField(r, [/\b(dni|nif|document)/i]) || null;

    // Business fields
    let clientType: 'business' | 'individual' = (r.client_type === 'business' || r.client_type === 'individual') ? r.client_type : detectClientType(r);
    const businessName = r.business_name || findAnyField(r, [/business.*name/i, /razon.*social/i, /company/i, /empresa/i]) || null;
    const cifNif = r.cif_nif || r.cif || r.nif_empresa || null;
      const tradeName = r.trade_name || r.nombre_comercial || null;

      // Security: sanitize all string inputs
      if (name) name = sanitizeString(String(name));
      if (surname) surname = sanitizeString(String(surname));
      if (phone) phone = sanitizeString(String(phone));
      if (dni) dni = sanitizeString(String(dni));

      // Prepare metadata and defaults for incomplete rows
      const attention_reasons: string[] = [];
      if (!email || !isValidEmail(String(email))) {
        // generate placeholder email unique-ish per row
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 8);
        email = `incomplete-${ts}-${rand}@placeholder.invalid`;
        attention_reasons.push('email_missing_or_invalid');
      } else {
        // Security: sanitize and normalize email
        email = sanitizeString(String(email)).toLowerCase();
      }
      let row: any = {
        email,
        phone: phone,
        company_id: authoritativeCompanyId,
        created_at: new Date().toISOString(),
        client_type: clientType,
      };

      // Downgrade to individual if we don't have a valid CIF for business
      if (clientType === 'business' && !isValidCIF(cifNif)) {
        clientType = 'individual';
        row.client_type = 'individual';
      }

      if (clientType === 'business') {
        let finalBusinessName = businessName ? sanitizeString(String(businessName)) : 'Empresa importada';
        const finalCif = sanitizeString(String(cifNif));
        row.business_name = finalBusinessName.toUpperCase();
        row.cif_nif = finalCif.toUpperCase();
        row.trade_name = tradeName ? sanitizeString(String(tradeName)).toUpperCase() : null;
        // Align name with business_name for compatibility
        row.name = row.business_name;
      } else {
        if (!name || String(name).trim() === '') { name = 'Cliente'; attention_reasons.push('name_missing'); }
        if (!surname || String(surname).trim() === '') { surname = 'Apellidos'; attention_reasons.push('surname_missing'); }
        row.name = sanitizeString((name || 'Cliente importado').toUpperCase());
        row.apellidos = surname ? sanitizeString(surname.toUpperCase()) : undefined;
        row.dni = dni ? sanitizeString(dni.toUpperCase()) : dni;
      }

      // Identification completeness check: if neither DNI nor CIF present, mark as inactive and flag attention
      const hasSomeIdentification = !!(row.dni && String(row.dni).trim() !== '') || !!(row.cif_nif && String(row.cif_nif).trim() !== '');
      if (!hasSomeIdentification) {
        attention_reasons.push('identification_missing');
        (row as any).is_active = false; // allow DB to accept incomplete rows when constraint is relaxed for inactive
      }
      // Prefer provided FK if present, otherwise leave null (address creation is handled elsewhere)
      if (r.direccion_id || r.address_id) {
        row.direccion_id = r.direccion_id || r.address_id;
      }
      // Merge/prepare metadata with needs_attention + reasons; also mark inactive_on_import
      let meta: Record<string, any> = {};
      if (r.metadata) {
        try { meta = typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {}); }
        catch { row.metadata_raw = r.metadata; }
      }
      if (attention_reasons.length) {
        meta.needs_attention = true;
        meta.attention_reasons = Array.isArray(meta.attention_reasons)
          ? [...new Set([...meta.attention_reasons, ...attention_reasons])]
          : attention_reasons;
        meta.inactive_on_import = true;
        // Mark record as inactive so UI can show it but place at bottom
        (row as any).is_active = false;
      }
  if (Object.keys(meta).length) row.metadata = meta;

      // Do NOT skip: we now always prepare the row, even if it had missing required fields
      // Final shallow clone to avoid accidental mutation later
      prepared.push({ ...row });
    }

  const inserted: any[] = [];
  const chunkSize = 50; // safer smaller chunk
  const errorsMap: Record<string, number> = {};
    for (let i = 0; i < prepared.length; i += chunkSize) {
      const chunk = prepared.slice(i, i + chunkSize);
      try {
        const { data, error } = await supabaseAdmin.from("clients").insert(chunk).select();
        if (error) {
          console.warn("import-customers: batch insert failed, fallback per-row", { i, count: chunk.length, error: error.message || error });
          for (const row of chunk) {
            try {
              const { data: one, error: oneErr } = await supabaseAdmin.from("clients").insert([row]).select().limit(1);
              if (oneErr) {
                // Handle duplicates gracefully (e.g., unique email constraint)
                const code = (oneErr as any)?.code || (oneErr as any)?.details || (oneErr as any)?.message || "";
                const msg = (oneErr as any)?.message || String(oneErr);
                const isDup = typeof code === "string" && code.includes("23505") || typeof msg === "string" && msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique");
                if (isDup && row.email) {
                  const { data: existing, error: fetchErr } = await supabaseAdmin.from("clients").select("*").eq("email", row.email).eq("company_id", row.company_id).limit(1);
                  if (!fetchErr && Array.isArray(existing) && existing.length) {
                    const current = existing[0];
                    const patch: any = {};
                    const isPlaceholder = (v: any) => typeof v === 'string' && (/^empresa importada$/i.test(v) || /^cliente importado$/i.test(v));
                    if (row.client_type && (!current.client_type || current.client_type !== row.client_type)) patch.client_type = row.client_type;
                    if (row.business_name && (isPlaceholder(current.business_name) || !current.business_name)) patch.business_name = row.business_name;
                    if (row.trade_name && !current.trade_name) patch.trade_name = row.trade_name;
                    if (row.cif_nif && (!current.cif_nif || /^B99999999$/i.test(current.cif_nif))) patch.cif_nif = row.cif_nif;
                    if (row.name && (isPlaceholder(current.name) || !current.name)) patch.name = row.name;
                    if (row.apellidos && (!current.apellidos || /^Apellidos$/i.test(current.apellidos))) patch.apellidos = row.apellidos;
                    if (row.metadata) patch.metadata = { ...(current.metadata || {}), ...(row.metadata || {}) };
                    if (Object.keys(patch).length) {
                      const { data: upd, error: updErr } = await supabaseAdmin.from("clients").update(patch).eq("id", current.id).select().limit(1);
                      const final = (!updErr && Array.isArray(upd) && upd.length) ? upd[0] : current;
                      inserted.push(final);
                    } else {
                      inserted.push(current);
                    }
                  } else {
                    errors.push({ error: oneErr.message || oneErr, row });
                  }
                } else {
                  errors.push({ error: oneErr.message || oneErr, row });
                  errorsMap[oneErr.message || String(oneErr)] = (errorsMap[oneErr.message || String(oneErr)] || 0) + 1;
                }
              } else inserted.push(Array.isArray(one) ? one[0] : one);
            } catch (e: any) {
              errors.push({ error: e?.message || String(e), row });
              errorsMap[e?.message || String(e)] = (errorsMap[e?.message || String(e)] || 0) + 1;
            }
          }
        } else {
          if (Array.isArray(data)) inserted.push(...data); else if (data) inserted.push(data);
        }
      } catch (e: any) {
        console.warn("import-customers: chunk exception, fallback per-row", { i, count: chunk.length, err: e?.message || String(e) });
        for (const row of chunk) {
          try {
            const { data: one, error: oneErr } = await supabaseAdmin.from("clients").insert([row]).select().limit(1);
            if (oneErr) {
              const code = (oneErr as any)?.code || (oneErr as any)?.details || (oneErr as any)?.message || "";
              const msg = (oneErr as any)?.message || String(oneErr);
              const isDup = typeof code === "string" && code.includes("23505") || typeof msg === "string" && msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique");
              if (isDup && row.email) {
                const { data: existing, error: fetchErr } = await supabaseAdmin.from("clients").select("*").eq("email", row.email).eq("company_id", row.company_id).limit(1);
                if (!fetchErr && Array.isArray(existing) && existing.length) {
                  const current = existing[0];
                  const patch: any = {};
                  const isPlaceholder = (v: any) => typeof v === 'string' && (/^empresa importada$/i.test(v) || /^cliente importado$/i.test(v));
                  if (row.client_type && (!current.client_type || current.client_type !== row.client_type)) patch.client_type = row.client_type;
                  if (row.business_name && (isPlaceholder(current.business_name) || !current.business_name)) patch.business_name = row.business_name;
                  if (row.trade_name && !current.trade_name) patch.trade_name = row.trade_name;
                  if (row.cif_nif && (!current.cif_nif || /^B99999999$/i.test(current.cif_nif))) patch.cif_nif = row.cif_nif;
                  if (row.name && (isPlaceholder(current.name) || !current.name)) patch.name = row.name;
                  if (row.apellidos && (!current.apellidos || /^Apellidos$/i.test(current.apellidos))) patch.apellidos = row.apellidos;
                  if (row.metadata) patch.metadata = { ...(current.metadata || {}), ...(row.metadata || {}) };
                  if (Object.keys(patch).length) {
                    const { data: upd, error: updErr } = await supabaseAdmin.from("clients").update(patch).eq("id", current.id).select().limit(1);
                    const final = (!updErr && Array.isArray(upd) && upd.length) ? upd[0] : current;
                    inserted.push(final);
                  } else {
                    inserted.push(current);
                  }
                } else {
                  errors.push({ error: oneErr.message || oneErr, row });
                }
              } else {
                errors.push({ error: oneErr.message || oneErr, row });
                errorsMap[oneErr.message || String(oneErr)] = (errorsMap[oneErr.message || String(oneErr)] || 0) + 1;
              }
            } else inserted.push(Array.isArray(one) ? one[0] : one);
          } catch (ee: any) {
            errors.push({ error: ee?.message || String(ee), row });
            errorsMap[ee?.message || String(ee)] = (errorsMap[ee?.message || String(ee)] || 0) + 1;
          }
        }
      }
    }

    try { console.log("import-customers: done", { inserted: inserted.length, errors: errors.length }); } catch {}
    return new Response(JSON.stringify({ inserted, errors, summary: { inserted: inserted.length, errors: errors.length, errorTypes: errorsMap } }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("import-customers exception", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
