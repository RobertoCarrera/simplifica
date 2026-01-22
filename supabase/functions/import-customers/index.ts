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
      // 1. Get public user ID
      const { data: userResult, error: userErr } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .limit(1)
        .maybeSingle();

      if (userErr) {
        console.error("import-customers: users mapping error", userErr);
      } else if (userResult) {
        // 2. Get active company membership
        const { data: memberResult, error: memberErr } = await supabaseAdmin
          .from("company_members")
          .select("company_id")
          .eq("user_id", userResult.id)
          .eq("status", "active")
          .limit(1);

        if (memberErr) {
          console.error("import-customers: company_members lookup error", memberErr);
        } else if (memberResult && memberResult.length > 0) {
          authoritativeCompanyId = memberResult[0].company_id;
        }
      }
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
    // Classification & parsing counters
    let countBusiness = 0;
    let countIndividual = 0;
    let countSelfEmployed = 0;
    let countConsumer = 0;
    let addressesProcessed = 0;
    let localitiesProcessed = 0;
    // Collections for locality + address creation
    const localityCandidates: Record<string, { postal_code: string; name: string; province: string | null; country: string | null }> = {};
    const parsedAddressByIndex: Record<number, {
      raw: string;
      street_type: string | null;
      street_name: string | null;
      number: string | null;
      postal_code: string | null;
      locality: string | null;
      province: string | null;
      country: string | null;
      composed: string;
    } | null> = {};
    // Helpers for address parsing
    const VIA_ALIASES = [ 'calle','cl','c/','c.','avenida','av','av.','avda','avda.','bulevar','bv','paseo','ps','ps.','camino','cm','cm.','carretera','ctra','ctra.','plaza','pl','pl.' ];
    const VIA_REGEX = new RegExp(`^(?:${VIA_ALIASES.map(v => v.replace(/\./g,'\.')).join('|')})$`, 'i');
  // Postal regex: capture 5 digits, tolerating variants like CP, C.P, C.P.
  const POSTAL_REGEX = /(?:\bc\.?p\.?\b\s*[:\-]?\s*)?(\d{5})(?!\d)/i;
    function parseAddress(raw?: string | null) {
      if (!raw || typeof raw !== 'string') return null;
      let original = raw.trim();
      if (!original) return null;
      original = original.replace(/\s+/g,' ').replace(/[<>"'`]/g,'').substring(0,300);
      const tokens = original.split(/[,;]/).map(t=>t.trim()).filter(Boolean);
      const joinedTokens = tokens.join(' ');
      let postal: string | null = null;
  const postalMatch = joinedTokens.match(POSTAL_REGEX); if (postalMatch) postal = postalMatch[1];
      let street_type: string | null = null, street_name: string | null = null, number: string | null = null; let locality: string | null = null, province: string | null = null, country: string | null = null;
      const complements: string[] = [];
      const firstClauseParts = tokens[0].split(/\s+/).filter(Boolean);
      if (firstClauseParts.length) {
        if (VIA_REGEX.test(firstClauseParts[0])) {
          street_type = firstClauseParts[0];
          if (firstClauseParts.length > 2 && /\d+[A-Za-z0-9/-]?$/i.test(firstClauseParts[firstClauseParts.length-1])) number = firstClauseParts.pop()!;
          street_name = firstClauseParts.slice(1).join(' ') || null;
        } else {
          const numIdx = firstClauseParts.findIndex(p => /\d+[A-Za-z0-9/-]?$/i.test(p));
          if (numIdx >= 0) { street_name = firstClauseParts.slice(0,numIdx).join(' ') || null; number = firstClauseParts[numIdx]; }
          else { street_name = firstClauseParts.join(' ') || null; }
        }
      }
      if (tokens.length > 1) {
        for (let i=1;i<tokens.length;i++) {
          const t = tokens[i];
          const tNoWS = t.replace(/[\s\-–—]+/g,' ').trim();
          // If contains postal, try to extract locality text around it
          if (postal && tNoWS.includes(postal)) {
            const locCandidate = tNoWS.replace(postal,'').replace(/[()]/g,'').replace(/^[,\s\-–—]+|[,\s\-–—]+$/g,'').trim();
            if (!locality && locCandidate) { locality = locCandidate; continue; }
          }
          // Try to capture house number if not found yet
          if (!number) {
            const numMatch = t.match(/\b(?:nº|no|num|numero|número|num\.|otr|portal|porta)?\s*(\d+[A-Za-z0-9/-]?)/i);
            if (numMatch && (!postal || !numMatch[1].includes(postal))) {
              number = numMatch[1];
            }
          }
          complements.push(t);
          if (!locality) locality = t; else if (!province) province = t; else if (!country) country = t;
        }
      }
      if (locality && postal) locality = locality.replace(postal,'').trim().replace(/^[,\s]+|[,\s]+$/g,'') || locality;
      const composedBase = [street_type, street_name].filter(Boolean).join(' ');
      const composed = [composedBase, number].filter(Boolean).join(' ').trim().toUpperCase();
      const parsed = { raw: original, street_type: street_type?street_type.toUpperCase():null, street_name: street_name?street_name.toUpperCase():null, number: number?number.toUpperCase():null, postal_code: postal, locality: locality?locality.toUpperCase():null, province: province?province.toUpperCase():null, country: country?country.toUpperCase():null, composed: composed || original.toUpperCase(), complements } as any;
      try { console.log('import-customers parseAddress', { raw: original, postal: parsed.postal_code, locality: parsed.locality, composed: parsed.composed }); } catch {}
      return parsed;
    }

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

    // Compose an address from many possible field variants (billing/shipping and multilingual keys)
    const extractAddressParts = (row: any) => {
      const g = (patterns: RegExp[], fallback: any = null) => findAnyField(row, patterns) ?? fallback;
      // Common prefixes: bill_to:, ship_to:, billing_, shipping_
      const addr1 = g([
        /^(bill_?to:)?(billing_)?(address(_?1)?|addr(_?1)?|street(_?1)?|calle|domicilio|direccion|dirección)$/i,
        /(bill_?to:|ship_?to:).*(address|street|calle|domicilio|direccion|dirección)(_?1)?$/i
      ]);
      const addr2 = g([
        /^(bill_?to:)?(billing_)?(address(_?2)?|addr(_?2)?|street(_?2)?|portal|planta|piso|escalera)$/i,
        /(bill_?to:|ship_?to:).*(address|street|calle).*(2)$/i
      ]);
      const numero = g([/(^|:)(n(ú|u)mero|numero|num|nº|portal|porta|door|puerta)($|\b)/i]);
      const cp = g([
        /(\b|:)(cp|c\.?p\.?)($|\b)/i,
        /(\b|:)(postal(_?code)?|codigo(_?postal)?|c(ó|o)digo\s*postal)($|\b)/i
      ]);
      const locality = g([/(^|:)(localidad|poblaci(ó|o)n|municipio|ciudad|town|city)($|\b)/i]);
      const province = g([/(^|:)(provincia|province|state)($|\b)/i]);
      const country = g([/(^|:)(pa(i|í)s|country)($|\b)/i]);

      // Build a raw string if we have enough parts
      const parts: string[] = [];
      if (addr1) parts.push(String(addr1));
      if (numero) parts.push(String(numero));
      if (addr2) parts.push(String(addr2));
      const right: string[] = [];
      if (cp) right.push(String(cp));
      if (locality) right.push(String(locality));
      if (province) right.push(String(province));
      if (country) right.push(String(country));
      const raw = parts.concat(right.length ? [right.join(', ')] : []).join(', ');
      return {
        raw: raw && typeof raw === 'string' ? raw : null,
        cp: cp ? String(cp) : null,
        locality: locality ? String(locality) : null,
        province: province ? String(province) : null,
        country: country ? String(country) : null,
      } as { raw: string | null; cp: string | null; locality: string | null; province: string | null; country: string | null };
    };

  // Detect business vs individual based on fields/keywords, preferring 'individual' unless we have strong signals
    const normalizeStr = (s: string) => (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .toLowerCase().trim().replace(/\s+/g, ' ');
    // Improved Spanish ID validators
    const cleanLegalId = (val?: string | null): string | null => {
      if (!val) return null;
      const v = String(val).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
      return v || null;
    };
    const isValidCIF = (val?: string | null) => {
      const v = cleanLegalId(val);
      if (!v) return false;
      // Common CIF formats: letter + 7 digits + control (digit or letter)
      return /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(v) || /^[ABCDEFGHJKLMNPQRSUVW]\d{8}$/.test(v);
    };
    const isValidDNI = (val?: string | null) => {
      const v = cleanLegalId(val);
      return !!(v && /^\d{8}[A-Z]$/.test(v));
    };
    const isValidNIE = (val?: string | null) => {
      const v = cleanLegalId(val);
      return !!(v && /^[XYZ]\d{7}[A-Z]$/.test(v));
    };
    const detectLegalId = (val?: string | null): { type: 'CIF' | 'DNI' | 'NIE' | 'UNKNOWN'; normalized: string | null } => {
      const v = cleanLegalId(val);
      if (!v) return { type: 'UNKNOWN', normalized: null };
      if (isValidCIF(v)) return { type: 'CIF', normalized: v };
      if (isValidDNI(v)) return { type: 'DNI', normalized: v };
      if (isValidNIE(v)) return { type: 'NIE', normalized: v };
      // fallback: if starts with letter + 8 digits, accept as CIF-ish
      if (/^[A-Z]\d{8}$/.test(v)) return { type: 'CIF', normalized: v };
      return { type: 'UNKNOWN', normalized: v };
    };
    // Broader business keyword detection (handles SL, SA, SLU without dots and many company forms)
    const BUSINESS_KEYWORD_REGEX = /\b(S\.?L\.?U?|S\.?A\.?|SLU|SL|SA|SAS|SRL|GMBH|LTD|LIMITED|INC|CORP|LLC|LLP|PLC|BV|NV|AG|OY|AB|AS|COOP|COOPERATIVA|SCOOP|SOCIEDAD\s+LIMITADA|SOCIEDAD\s+ANONIMA|SLL|SLNE|SC|SNC|EURL|SARL|SASU|UTE|U\.T\.E\.)\b/i;
    const matchBizKeyword = (s?: string | null): string | null => {
      if (!s || typeof s !== 'string') return null;
      const m = s.match(BUSINESS_KEYWORD_REGEX);
      return m ? m[0] : null;
    };
    const scanRowForBizKeyword = (row: any): { keyword: string; field: string } | null => {
      if (!row || typeof row !== 'object') return null;
      const preferredFields = [
        'business_name','razon_social','company','empresa','trade_name','nombre_comercial','cliente','cliente_nombre','nombre','apellidos','surname','last_name','full_name','denominacion','denominación'
      ];
      // Check preferred fields first
      for (const key of preferredFields) {
        const v = row[key];
        if (typeof v === 'string' && v.trim()) {
          const mk = matchBizKeyword(v);
          if (mk) return { keyword: mk, field: key };
        }
      }
      // Then scan any other string value except emails
      for (const [k, v] of Object.entries(row)) {
        if (preferredFields.includes(k)) continue;
        if (typeof v === 'string' && v.trim() && !v.includes('@')) {
          const mk = matchBizKeyword(v);
          if (mk) return { keyword: mk, field: k };
        }
      }
      return null;
    };
    const detectClientType = (row: any): { type: 'business' | 'individual'; by: 'cif' | 'keyword' | 'none'; keyword?: string; field?: string } => {
      const name = String(row.name || row.nombre || '');
      const surname = String(row.surname || row.apellidos || row.last_name || '');
      const businessName = String(row.business_name || findAnyField(row, [/business.*name/i, /razon.*social/i, /company/i, /empresa/i]) || '');
      const cif = row.cif_nif || row.cif || row.nif_empresa || null;
      const probablePersonalCompany = businessName && normalizeStr(businessName) === normalizeStr(`${name} ${surname}`);
      if (isValidCIF(cif) && !probablePersonalCompany) return { type: 'business', by: 'cif' };
      const scan = scanRowForBizKeyword(row);
      if (scan && !probablePersonalCompany) return { type: 'business', by: 'keyword', keyword: scan.keyword, field: scan.field };
      return { type: 'individual', by: 'none' };
    };

  for (const r of rows) {
      // tolerant lookup: accept keys like 'bill_to:email', 'ship_to:email', 'bill_to:first_name', etc.
      let email = r.email || r.correo || findAnyField(r, [/(:|\b)email$/i, /^email$/i, /:correo$/i, /correo$/i]) || null;
      let name = r.name || r.nombre || findAnyField(r, [/(:|\b)first_name$/i, /(:|\b)name$/i, /first_name$/i, /name$/i]) || "";
      let surname = r.surname || r.apellidos || r.last_name || findAnyField(r, [/(:|\b)last_name$/i, /(:|\b)last$/i, /last_name$/i, /apellidos$/i]) || "";
      let phone = r.phone || r.telefono || findAnyField(r, [/(:|\b)phone$/i, /telefono$/i, /tel$/i]) || null;
  let dni = r.dni || r.nif || findAnyField(r, [/\b(dni|nif|document)/i]) || null;
  // Legal ID field (e.g., bill_to:legal)
  const legalRaw = r.legal || r['bill_to:legal'] || findAnyField(r, [/(:|\b)legal$/i, /\b(cif|dni|nif|nie)\b/i]) || null;
  const legalParsed = detectLegalId(legalRaw);

    // Business fields
  const detected = detectClientType(r);
  let clientType: 'business' | 'individual' = detected.type;
    const businessName = r.business_name || findAnyField(r, [/business.*name/i, /razon.*social/i, /company/i, /empresa/i]) || null;
  const cifNif = r.cif_nif || r.cif || r.nif_empresa || (legalParsed.type === 'CIF' ? legalParsed.normalized : null) || null;
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

      // If detection used keyword and there's no CIF, keep as business; if by none, stays individual
      // If somehow a wrong pre-set client_type arrived, we do not trust it anymore (server is authoritative)
      row.client_type = clientType;
      if (clientType === 'business') countBusiness++; else countIndividual++;
      // Person subtype classification for individuals
      let person_subtype: 'self_employed' | 'consumer' | null = null;
      if (clientType === 'individual') {
        const norm = (s: any) => (s ? String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim() : '');
        const hasTradeIndicators = tradeName && /(autonom|freelanc|consultor|asesor|studio|estudio|taller)/i.test(String(tradeName));
        const businessMatchesPersonal = businessName && norm(businessName) === norm(`${name} ${surname}`);
        if (hasTradeIndicators || businessMatchesPersonal) { person_subtype = 'self_employed'; countSelfEmployed++; }
        else { person_subtype = 'consumer'; countConsumer++; }
      }

      if (clientType === 'business') {
        let finalBusinessName = businessName ? sanitizeString(String(businessName)) : 'Empresa importada';
        row.business_name = finalBusinessName.toUpperCase();
        // Only set cif_nif when we actually have one
        const cNorm = cleanLegalId(cifNif) || (legalParsed.type === 'CIF' ? legalParsed.normalized : null);
        if (cNorm) row.cif_nif = cNorm;
        row.trade_name = tradeName ? sanitizeString(String(tradeName)).toUpperCase() : null;
        // Align name with business_name for compatibility
        row.name = row.business_name;
      } else {
        if (!name || String(name).trim() === '') { name = 'Cliente'; attention_reasons.push('name_missing'); }
        if (!surname || String(surname).trim() === '') { surname = 'Apellidos'; attention_reasons.push('surname_missing'); }
        row.name = sanitizeString((name || 'Cliente importado').toUpperCase());
        row.apellidos = surname ? sanitizeString(surname.toUpperCase()) : undefined;
        // Prefer a valid DNI/NIE from legal field; fallback to dni/nif columns
        const dNorm = (legalParsed.type === 'DNI' || legalParsed.type === 'NIE') ? legalParsed.normalized : cleanLegalId(dni);
        if (dNorm) row.dni = dNorm; // don't set if missing
      }

      // Identification completeness check: if neither DNI nor CIF present, mark as inactive and flag attention
  const hasSomeIdentification = !!(row.dni && String(row.dni).trim() !== '') || !!(row.cif_nif && String(row.cif_nif).trim() !== '');
      if (!hasSomeIdentification) {
        attention_reasons.push('identification_missing');
        (row as any).is_active = false; // allow DB to accept incomplete rows when constraint is relaxed for inactive
      }
      // Address parsing stage (collect raw for later bulk upsert) with broader field coverage
      const extracted = extractAddressParts(r);
      let rawAddress = (r.direccion || r.address || r.address_line || r.street || r.calle || r.domicilio || null) as string | null;
      // Prefer composed raw from extracted parts if present or if no single raw available
      if (extracted && (extracted.raw || (!rawAddress && (extracted.cp || extracted.locality)))) {
        // Compose a helpful raw if missing main line
        rawAddress = extracted.raw || [extracted.cp, extracted.locality, extracted.province, extracted.country].filter(Boolean).join(', ');
      }
      if (!row.direccion_id) {
        if (rawAddress) {
          const parsed = parseAddress(String(rawAddress));
          // If parse didn't catch postal/locality but we have them from extracted split fields, inject them
          if (parsed) {
            if (!parsed.postal_code && extracted.cp) parsed.postal_code = String(extracted.cp).replace(/\D+/g, '').slice(0, 5) || null;
            if (!parsed.locality && extracted.locality) parsed.locality = String(extracted.locality).toUpperCase();
            if (!parsed.province && extracted.province) parsed.province = String(extracted.province).toUpperCase();
            if (!parsed.country && extracted.country) parsed.country = String(extracted.country).toUpperCase();
          }
          try { console.log('import-customers address-extract', { idx: prepared.length, rawProvided: !!(r.direccion || r.address || r.address_line || r.street || r.calle || r.domicilio), composedRaw: extracted.raw ? String(extracted.raw).slice(0,120) : null, cp: parsed?.postal_code || (extracted.cp ? String(extracted.cp) : null), locality: parsed?.locality || (extracted.locality ? String(extracted.locality).toUpperCase() : null) }); } catch {}
          parsedAddressByIndex[prepared.length] = parsed;
          // Seed locality candidates when we have a postal code from either source
          const cpSeed = parsed?.postal_code || (extracted.cp ? String(extracted.cp).replace(/\D+/g, '').slice(0, 5) : null);
          if (cpSeed) {
            const nameSeed = parsed?.locality || (extracted.locality ? String(extracted.locality).toUpperCase() : cpSeed);
            if (!localityCandidates[cpSeed]) {
              localityCandidates[cpSeed] = {
                postal_code: cpSeed,
                name: nameSeed,
                province: (parsed?.province || (extracted.province ? String(extracted.province).toUpperCase() : null)) as string | null,
                country: (parsed?.country || (extracted.country ? String(extracted.country).toUpperCase() : null)) as string | null,
              };
            }
          }
        } else {
          // No raw address available at all; still try to use split fields for locality resolution later
          const minimal: any = {
            raw: null,
            street_type: null,
            street_name: null,
            number: null,
            postal_code: extracted.cp ? String(extracted.cp).replace(/\D+/g, '').slice(0, 5) : null,
            locality: extracted.locality ? String(extracted.locality).toUpperCase() : null,
            province: extracted.province ? String(extracted.province).toUpperCase() : null,
            country: extracted.country ? String(extracted.country).toUpperCase() : null,
            composed: '',
          };
          parsedAddressByIndex[prepared.length] = (minimal.postal_code || minimal.locality) ? minimal : null;
          if (minimal.postal_code && !localityCandidates[minimal.postal_code]) {
            localityCandidates[minimal.postal_code] = { postal_code: minimal.postal_code, name: minimal.locality || minimal.postal_code, province: minimal.province, country: minimal.country };
          }
          try { console.log('import-customers address-extract (no raw)', { idx: prepared.length, cp: minimal.postal_code, locality: minimal.locality, province: minimal.province }); } catch {}
        }
      }
      // Prefer provided FK if present
      if (r.direccion_id || r.address_id) { row.direccion_id = r.direccion_id || r.address_id; }
      // Merge/prepare metadata with needs_attention + reasons; also mark inactive_on_import
  let meta: Record<string, any> = {};
  // Attach classification signals to metadata for traceability
  meta.classification = { by: detected.by, keyword: detected.keyword || null, field: detected.field || null, idType: legalParsed.type };
  // Persist parsed address for UI assistance
  const parsedForMeta = parsedAddressByIndex[prepared.length] || null;
  if (parsedForMeta) meta.address_parsed = parsedForMeta;
  if (person_subtype) meta.person_subtype = person_subtype;
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
  // ===== Bulk locality & address upsert BEFORE client insert =====
  const addrStartMs = Date.now();
  let postalToLocalityId: Record<string, string> = {};
  const localityPayloads = Object.values(localityCandidates)
    .map(l => ({ name: l.name?.toUpperCase(), province: l.province ? l.province.toUpperCase() : null, country: l.country ? l.country.toUpperCase() : null, postal_code: (l.postal_code || '').toString().replace(/\D+/g,'') }))
    .filter(p => p.postal_code && p.name);
  try { console.log('import-customers localityCandidates', { count: localityPayloads.length, sample: localityPayloads[0] }); } catch {}
  if (localityPayloads.length) {
    // Process one by one to leverage RPC insert_or_get_locality with reliable id return
    for (const lp of localityPayloads) {
      const cp = lp.postal_code;
      if (!cp || postalToLocalityId[cp]) continue;
      let gotId: string | null = null;
      // 1) Try RPC first
      try {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('insert_or_get_locality', {
          p_name: lp.name,
          p_province: lp.province,
          p_country: lp.country,
          p_postal_code: cp
        });
        if (!rpcErr && rpcData) {
          const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
          if (row?.id) {
            gotId = row.id;
          }
        } else if (rpcErr) {
          console.warn('import-customers RPC insert_or_get_locality error', rpcErr.message || rpcErr);
        }
      } catch (e: any) {
        console.warn('import-customers RPC insert_or_get_locality exception', e?.message || String(e));
      }
      // 2) Fallback to upsert on postal_code
      if (!gotId) {
        try {
          const { data: upData, error: upErr } = await supabaseAdmin.from('localities').upsert({ name: lp.name, province: lp.province, country: lp.country, postal_code: cp }, { onConflict: 'postal_code' }).select().single();
          if (!upErr && upData?.id) gotId = upData.id; else if (upErr) console.warn('import-customers locality upsert error', upErr.message || upErr);
        } catch (e: any) { console.warn('import-customers locality upsert exception', e?.message || String(e)); }
      }
      // 3) Final fallback select
      if (!gotId) {
        try {
          const { data: sel } = await supabaseAdmin.from('localities').select('id').eq('postal_code', cp).maybeSingle();
          if (sel?.id) gotId = sel.id;
        } catch {}
      }
      if (gotId) {
        postalToLocalityId[cp] = gotId;
        localitiesProcessed++;
      }
    }
  }
  interface AddressPayload { direccion: string; numero: string | null; locality_id: string; usuario_id: string | null; company_id: string; }
  const addressPayloads: AddressPayload[] = [];
  const addressIndexToDireccionId: Record<number, string> = {};
  const indexToLocalityId: Record<number, string> = {};
  for (let idx=0; idx<prepared.length; idx++) {
    const parsed = parsedAddressByIndex[idx];
    if (!parsed) continue;
    let locality_id = parsed.postal_code ? postalToLocalityId[parsed.postal_code] : null;
    // Fallback: if no cp match, try by locality name (and optional province)
    if (!locality_id && parsed.locality) {
      try {
        // First try exact (case-insensitive) by name
        const { data: eqByName } = await supabaseAdmin.from('localities').select('id,name,province').eq('name', parsed.locality).limit(2);
        if (Array.isArray(eqByName) && eqByName.length === 1 && eqByName[0]?.id) {
          locality_id = eqByName[0].id;
        } else {
          // Then try ilike pattern, optionally filter by province if available
          let q = supabaseAdmin.from('localities').select('id,name,province').ilike('name', `%${parsed.locality}%`).limit(5);
          if (parsed.province) q = q.ilike('province', `%${parsed.province}%`);
          const { data: likeData } = await q;
          if (Array.isArray(likeData) && likeData.length === 1 && likeData[0]?.id) {
            locality_id = likeData[0].id;
          } else if (Array.isArray(likeData) && likeData.length > 1) {
            // If multiple matches and we have exact province, try exact province filter
            if (parsed.province) {
              const exactProv = likeData.find(l => (l.province || '').toUpperCase() === parsed.province);
              if (exactProv?.id) locality_id = exactProv.id;
            }
          }
        }
        // If still not found and we at least have a locality name, insert a new locality without postal_code
        if (!locality_id && parsed.locality) {
          try {
            const { data: insLoc, error: insErr } = await supabaseAdmin
              .from('localities')
              .insert({ name: parsed.locality, province: parsed.province || null, country: parsed.country || null, postal_code: null })
              .select()
              .single();
            if (!insErr && insLoc?.id) {
              locality_id = insLoc.id;
              try { console.log('import-customers created locality without postal', { idx, name: parsed.locality, province: parsed.province || null }); } catch {}
            } else if (insErr) {
              console.warn('import-customers locality insert (no postal) error', insErr.message || insErr);
            }
          } catch (eIns: any) {
            console.warn('import-customers locality insert (no postal) exception', eIns?.message || String(eIns));
          }
        }
        if (!locality_id) { try { console.log('import-customers skip address: locality not found by name', { idx, locality: parsed.locality, province: parsed.province }); } catch {} }
      } catch (e: any) { console.warn('import-customers locality lookup by name exception', e?.message || String(e)); }
    }
    // If we resolved by name (no cp), count it as processed locality for visibility
    if (!parsed.postal_code && locality_id) { localitiesProcessed++; }
    if (!locality_id) continue;
    indexToLocalityId[idx] = locality_id;
    const direccion = parsed.composed; const numero = parsed.number || null;
    if (direccion && !prepared[idx].direccion_id) addressPayloads.push({ direccion, numero, locality_id, usuario_id: authUserId, company_id: authoritativeCompanyId });
  }
  if (addressPayloads.length) {
    for (const ap of addressPayloads) {
      try {
        let rowAddr: any = null;
        // 1) RPC first: insert_or_get_address
        try {
          const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('insert_or_get_address', {
            p_direccion: ap.direccion,
            p_locality_id: ap.locality_id,
            p_numero: ap.numero,
            p_usuario_id: ap.usuario_id
          });
          if (!rpcErr && rpcData) {
            rowAddr = Array.isArray(rpcData) ? rpcData[0] : rpcData;
          } else if (rpcErr) {
            console.warn('import-customers RPC insert_or_get_address error', rpcErr.message || rpcErr);
          }
        } catch (e: any) {
          console.warn('import-customers RPC insert_or_get_address exception', e?.message || String(e));
        }
        // Ensure company_id is set if RPC didn't set it
        if (rowAddr?.id && (!rowAddr.company_id || rowAddr.company_id !== ap.company_id)) {
          try {
            const { data: upd, error: updErr } = await supabaseAdmin.from('addresses').update({ company_id: ap.company_id }).eq('id', rowAddr.id).select().single();
            if (!updErr && upd) rowAddr = upd;
          } catch {}
        }
        // 2) Fallback to upsert
        if (!rowAddr) {
          const { data: upData, error: upErr } = await supabaseAdmin.from('addresses').upsert({ direccion: ap.direccion, numero: ap.numero, locality_id: ap.locality_id, usuario_id: ap.usuario_id, company_id: ap.company_id }, { onConflict: 'direccion,locality_id,usuario_id' }).select();
          if (!upErr && upData) { rowAddr = Array.isArray(upData)?upData[0]:upData; }
          else if (upErr) {
            const msg = upErr?.message?.toLowerCase() || '';
            const noUnique = msg.includes('no unique or exclusion constraint') || msg.includes('on conflict specification');
            if (noUnique) {
              const { data: existing, error: selErr } = await supabaseAdmin.from('addresses').select('*').eq('direccion', ap.direccion).eq('locality_id', ap.locality_id).eq('company_id', ap.company_id).maybeSingle();
              if (!selErr && existing) rowAddr = existing; else {
                const { data: insData, error: insErr } = await supabaseAdmin.from('addresses').insert({ direccion: ap.direccion, numero: ap.numero, locality_id: ap.locality_id, usuario_id: ap.usuario_id, company_id: ap.company_id }).select().single();
                if (!insErr) rowAddr = insData;
              }
            } else { console.warn('import-customers address upsert error', upErr.message || upErr); }
          }
        }
        if (rowAddr?.id) {
          for (let idx=0; idx<prepared.length; idx++) {
            const parsed = parsedAddressByIndex[idx];
            if (!parsed) continue;
            const locIdForIdx = indexToLocalityId[idx] || (parsed.postal_code ? postalToLocalityId[parsed.postal_code] : undefined);
            if (!prepared[idx].direccion_id && parsed.composed === ap.direccion && locIdForIdx === ap.locality_id) {
              prepared[idx].direccion_id = rowAddr.id;
              addressIndexToDireccionId[idx] = rowAddr.id;
            }
          }
          addressesProcessed++;
        }
      } catch (addrE: any) { console.warn('import-customers address creation exception', addrE?.message || String(addrE)); }
    }
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

  const addrSpentMs = Date.now() - addrStartMs;
  try { console.log("import-customers: done", { inserted: inserted.length, errors: errors.length, localitiesProcessed, addressesProcessed, addressResolutionMs: addrSpentMs }); } catch {}
  return new Response(JSON.stringify({ inserted, errors, summary: { inserted: inserted.length, errors: errors.length, errorTypes: errorsMap, classification: { business: countBusiness, individual: countIndividual, self_employed: countSelfEmployed, consumer: countConsumer }, localitiesProcessed, addressesProcessed, addressResolutionMs: addrSpentMs } }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("import-customers exception", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
