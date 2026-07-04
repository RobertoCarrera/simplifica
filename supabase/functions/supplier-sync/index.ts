import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Helpers ───────────────────────────────────────────────────────────────

function resolvePath(obj: unknown, path: string): unknown {
  if (!path || path === "") return obj;
  let current: unknown = obj;
  for (const part of path.split(".")) {
    if (current == null) return undefined;
    const match = part.match(/^(\w+)(?:\[(\d+)\])?$/);
    if (match) {
      current = (current as Record<string, unknown>)[match[1]];
      if (match[2] && Array.isArray(current)) {
        current = current[parseInt(match[2], 10)];
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

function applyTransform(value: unknown, transform?: string | null): unknown {
  if (value == null || !transform) return value;
  const v = String(value);
  switch (transform) {
    case "number": {
      const cleaned = v.replace(/[^\d,.-]/g, "");
      if (cleaned.includes(",") && cleaned.includes(".")) {
        return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
      }
      if (cleaned.includes(",") && !cleaned.includes(".")) {
        return parseFloat(cleaned.replace(",", ".")) || 0;
      }
      return parseFloat(cleaned) || 0;
    }
    case "trim":
      return v.trim();
    case "null_if_empty":
      return v.trim() === "" ? null : v.trim();
    default:
      if (transform.startsWith("multiply:")) {
        const factor = parseFloat(transform.split(":")[1]) || 1;
        const num = parseFloat(v) || 0;
        return Math.round(num * factor * 100) / 100;
      }
      return value;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

interface SyncConfig {
  response_path?: string;
  pagination?: "none" | "page" | "offset" | "cursor";
  page_param?: string;
  page_size_param?: string;
  page_size?: number;
  max_pages?: number;
  cursor_path?: string;
  auth_type?: "none" | "bearer" | "api_key_header" | "api_key_query";
  auth_token?: string;
  auth_header_name?: string;
  auth_query_param?: string;
  headers?: Record<string, string>;
}

interface FieldMapping {
  source_path: string;
  target_field: string;
  transform?: string | null;
  is_required: boolean;
}

interface SupplierRow {
  id: string;
  company_id: string;
  name: string;
  base_url: string | null;
  sync_config: SyncConfig;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(companyId: string, maxPerMin = 10): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(companyId);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(companyId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  entry.count++;
  return entry.count <= maxPerMin;
}

function isUrlAllowed(urlString: string): { ok: boolean; error?: string } {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, error: "Only http(s) URLs allowed" };
    }
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("169.254.") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return { ok: false, error: "Internal/private URLs are not allowed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 2. Extract user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Extract company_id from JWT claims
    const userCompanyId = (user.app_metadata?.company_id as string) ||
                          (user.user_metadata?.company_id as string);
    if (!userCompanyId) {
      return new Response(JSON.stringify({ error: "User has no company_id" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Rate limit per company
    if (!checkRateLimit(userCompanyId, 10)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Max 10 syncs/minute." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 5. Validate input
    const { supplier_id } = await req.json();
    if (!supplier_id || typeof supplier_id !== "string") {
      return new Response(JSON.stringify({ error: "supplier_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 6. Load supplier AND verify ownership in single query (tenant isolation)
    const { data: supplier, error: supplierError } = await supabase
      .from("catalog_suppliers")
      .select("*")
      .eq("id", supplier_id)
      .eq("company_id", userCompanyId)
      .maybeSingle();

    if (supplierError) {
      console.error("Supplier query error:", supplierError);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!supplier) {
      return new Response(JSON.stringify({ error: "Supplier not found or access denied" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const s = supplier as SupplierRow;
    if (!s.base_url) {
      return new Response(JSON.stringify({ error: "Supplier has no base_url configured" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 7. SSRF protection
    const urlCheck = isUrlAllowed(s.base_url);
    if (!urlCheck.ok) {
      console.error(`Blocked SSRF attempt: company=${userCompanyId} url=${s.base_url}`);
      return new Response(JSON.stringify({ error: `Invalid base_url: ${urlCheck.error}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 8. Load field mappings
    const { data: mappings } = await supabase
      .from("supplier_field_mappings")
      .select("*")
      .eq("supplier_id", supplier_id);

    const fieldMappings: FieldMapping[] = (mappings || []) as FieldMapping[];
    const config: SyncConfig = s.sync_config || {};

    // 9. Build auth
    const authHeaders: Record<string, string> = { ...(config.headers || {}) };
    const authQueryParams: Record<string, string> = {};

    switch (config.auth_type) {
      case "bearer":
        authHeaders["Authorization"] = `Bearer ${config.auth_token || ""}`;
        break;
      case "api_key_header":
        authHeaders[config.auth_header_name || "X-API-Key"] = config.auth_token || "";
        break;
      case "api_key_query":
        authQueryParams[config.auth_query_param || "api_key"] = config.auth_token || "";
        break;
    }

    // 10. Fetch with pagination + timeout
    let allProducts: Record<string, unknown>[] = [];
    let pageNum = 1;
    let offset = 0;
    let cursor: string | undefined;
    const pageSize = Math.min(config.page_size || 100, 500);
    const maxPages = Math.min(config.max_pages || 50, 200);
    let pagesFetched = 0;

    while (pagesFetched < maxPages) {
      const url = new URL(s.base_url!);
      for (const [k, v] of Object.entries(authQueryParams)) {
        url.searchParams.set(k, v);
      }
      if (config.pagination === "page") {
        url.searchParams.set(config.page_param || "page", String(pageNum));
        url.searchParams.set(config.page_size_param || "pageSize", String(pageSize));
      } else if (config.pagination === "offset") {
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("limit", String(pageSize));
      } else if (config.pagination === "cursor" && cursor) {
        url.searchParams.set("cursor", cursor);
      }

      let response: Response;
      try {
        response = await fetchWithTimeout(url.toString(), {
          method: "GET",
          headers: { "Accept": "application/json", ...authHeaders },
        }, 15000);
      } catch (fetchError: any) {
        if (fetchError.name === "AbortError") {
          throw new Error(`Request timeout after 15s for page ${pagesFetched + 1}`);
        }
        throw fetchError;
      }

      if (!response.ok) {
        // Don't include response body — could leak auth tokens
        throw new Error(`API returned HTTP ${response.status} ${response.statusText}`);
      }

      const json = await response.json();

      const products = resolvePath(json, config.response_path || "") as unknown[];
      if (!Array.isArray(products) || products.length === 0) {
        break;
      }

      allProducts = allProducts.concat(products as Record<string, unknown>[]);
      pagesFetched++;

      if (config.pagination === "page") {
        pageNum++;
        if (products.length < pageSize) break;
      } else if (config.pagination === "offset") {
        offset += pageSize;
        if (products.length < pageSize) break;
      } else if (config.pagination === "cursor") {
        const nextCursor = resolvePath(json, config.cursor_path || "meta.next_cursor") as string | undefined;
        if (!nextCursor) break;
        cursor = nextCursor;
      } else {
        break;
      }
    }

    // 11. Map products
    const cacheRows = allProducts.map((product) => {
      const row: Record<string, unknown> = {
        supplier_id,
        company_id: s.company_id,
        raw_data: product,
        fetched_at: new Date().toISOString(),
      };

      for (const mapping of fieldMappings) {
        let value = resolvePath(product, mapping.source_path);
        value = applyTransform(value, mapping.transform);
        if (["name", "description", "brand", "category", "model", "external_id"].includes(mapping.target_field)) {
          row[mapping.target_field] = value;
        } else if (mapping.target_field === "price") {
          row["supplier_price"] = value;
        } else if (mapping.target_field === "stock") {
          row["stock_quantity"] = value;
        }
      }

      if (!row["external_id"]) {
        row["external_id"] = row["model"] || row["name"] || `item-${allProducts.indexOf(product)}`;
      }

      return row;
    }).filter((row) => row["name"] != null && row["name"] !== "");

    // 12. Upsert cache
    const batchSize = 100;
    let upserted = 0;
    for (let i = 0; i < cacheRows.length; i += batchSize) {
      const batch = cacheRows.slice(i, i + batchSize);
      const { error: upsertError } = await supabase
        .from("supplier_products_cache")
        .upsert(batch, { onConflict: "supplier_id,external_id", ignoreDuplicates: false });

      if (upsertError) {
        console.error("Upsert error on batch", i, upsertError);
      } else {
        upserted += batch.length;
      }
    }

    await supabase.from("catalog_suppliers").update({
      updated_at: new Date().toISOString(),
    }).eq("id", supplier_id);

    return new Response(JSON.stringify({
      success: true,
      fetched: allProducts.length,
      cached: upserted,
      pages: pagesFetched,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("supplier-sync error:", error);
    // Don't leak internal error details to client
    const safeMessage = error?.message?.includes("HTTP") || error?.message?.includes("timeout")
      ? error.message
      : "Sync failed. Check server logs for details.";
    return new Response(JSON.stringify({
      error: safeMessage,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});