import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Edge Function: auto-sync-suppliers
// Called by pg_cron every hour. Iterates over suppliers where
// auto_sync_enabled = true and auto_sync_frequency matches, and runs the
// sync logic for each. Uses service_role key (no JWT).
//
// IMPORTANT: This function runs SERVER-SIDE. It trusts its own auth
// (service_role) and does NOT perform per-user tenant checks. The RLS
// policies on suppliers / supplier_products_cache still protect the data,
// but in practice all auto-sync runs happen in a single "system" context.

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startedAt = new Date().toISOString();
  console.log(`[auto-sync] Starting at ${startedAt}`);

  try {
    // Find suppliers that are eligible for auto-sync RIGHT NOW
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Eligible: auto_sync_enabled = true AND (
    //   (frequency = 'hourly' AND updated_at < 1h ago) OR
    //   (frequency = 'daily' AND updated_at < 24h ago) OR
    //   (frequency = 'weekly' AND updated_at < 7d ago)
    // )
    // For first run (never synced), updated_at is null OR very old.
    const { data: suppliers, error } = await supabase
      .from("suppliers")
      .select("id, name, adapter_type, base_url, sync_config, auto_sync_frequency, updated_at")
      .eq("auto_sync_enabled", true)
      .or(`updated_at.is.null,updated_at.lt.${oneWeekAgo}`);

    if (error) {
      console.error("[auto-sync] Failed to fetch suppliers:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const candidates = (suppliers || []).filter((s) => {
      if (!s.updated_at) return true; // Never synced
      const updatedAt = new Date(s.updated_at);
      const lastRun = now.getTime() - updatedAt.getTime();
      if (s.auto_sync_frequency === "hourly") return lastRun > 60 * 60 * 1000;
      if (s.auto_sync_frequency === "weekly") return lastRun > 7 * 24 * 60 * 60 * 1000;
      // Default: daily
      return lastRun > 24 * 60 * 60 * 1000;
    });

    console.log(`[auto-sync] Found ${candidates.length} suppliers to sync`);

    const results = [];
    for (const supplier of candidates) {
      if (supplier.adapter_type !== "rest_api") {
        // Skip CSV-only suppliers (no automatic sync possible)
        results.push({ id: supplier.id, name: supplier.name, skipped: "csv_upload" });
        continue;
      }

      try {
        // Inline the sync logic (same as supplier-sync but inline, no JWT needed)
        const result = await syncOne(supabase, supplier);
        results.push({ id: supplier.id, name: supplier.name, ...result });
      } catch (syncError: any) {
        console.error(`[auto-sync] Failed for ${supplier.name}:`, syncError);
        results.push({ id: supplier.id, name: supplier.name, error: syncError.message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      results,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[auto-sync] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ─── Inline sync logic (copied from supplier-sync, adapted for service_role) ─

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
    case "trim": return v.trim();
    case "null_if_empty": return v.trim() === "" ? null : v.trim();
    default:
      if (transform.startsWith("multiply:")) {
        const factor = parseFloat(transform.split(":")[1]) || 1;
        const num = parseFloat(v) || 0;
        return Math.round(num * factor * 100) / 100;
      }
      return value;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
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

async function syncOne(supabase: any, supplier: any) {
  const cfg: SyncConfig = supplier.sync_config || {};
  const authHeaders: Record<string, string> = { ...(cfg.headers || {}) };
  const authQueryParams: Record<string, string> = {};

  switch (cfg.auth_type) {
    case "bearer":
      authHeaders["Authorization"] = `Bearer ${cfg.auth_token || ""}`;
      break;
    case "api_key_header":
      authHeaders[cfg.auth_header_name || "X-API-Key"] = cfg.auth_token || "";
      break;
    case "api_key_query":
      authQueryParams[cfg.auth_query_param || "api_key"] = cfg.auth_token || "";
      break;
  }

  // Load field mappings
  const { data: mappings } = await supabase
    .from("supplier_field_mappings")
    .select("*")
    .eq("supplier_id", supplier.id);

  let allProducts: Record<string, unknown>[] = [];
  let pageNum = 1;
  let offset = 0;
  let cursor: string | undefined;
  const pageSize = Math.min(cfg.page_size || 100, 500);
  const maxPages = Math.min(cfg.max_pages || 50, 200);

  for (let p = 0; p < maxPages; p++) {
    const url = new URL(supplier.base_url);
    for (const [k, v] of Object.entries(authQueryParams)) url.searchParams.set(k, v);
    if (cfg.pagination === "page") {
      url.searchParams.set(cfg.page_param || "page", String(pageNum));
      url.searchParams.set(cfg.page_size_param || "pageSize", String(pageSize));
    } else if (cfg.pagination === "offset") {
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(pageSize));
    } else if (cfg.pagination === "cursor" && cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json", ...authHeaders },
    }, 30000);

    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
    const json = await response.json();
    const products = resolvePath(json, cfg.response_path || "") as unknown[];
    if (!Array.isArray(products) || products.length === 0) break;
    allProducts = allProducts.concat(products as Record<string, unknown>[]);

    if (cfg.pagination === "page") {
      pageNum++;
      if (products.length < pageSize) break;
    } else if (cfg.pagination === "offset") {
      offset += pageSize;
      if (products.length < pageSize) break;
    } else if (cfg.pagination === "cursor") {
      const nextCursor = resolvePath(json, cfg.cursor_path || "meta.next_cursor") as string | undefined;
      if (!nextCursor) break;
      cursor = nextCursor;
    } else break;
  }

  // Map and upsert
  const cacheRows = allProducts.map((product: any) => {
    const row: Record<string, unknown> = {
      supplier_id: supplier.id,
      company_id: supplier.company_id,
      raw_data: product,
      fetched_at: new Date().toISOString(),
    };
    for (const mapping of (mappings || []) as any[]) {
      let value = resolvePath(product, mapping.source_path);
      value = applyTransform(value, mapping.transform);
      if (["name", "description", "brand", "category", "model", "external_id"].includes(mapping.target_field)) {
        row[mapping.target_field] = value;
      } else if (mapping.target_field === "price") row["supplier_price"] = value;
      else if (mapping.target_field === "stock") row["stock_quantity"] = value;
    }
    if (!row["external_id"]) {
      row["external_id"] = row["model"] || row["name"] || `item-${allProducts.indexOf(product)}`;
    }
    return row;
  }).filter((row) => row["name"] != null && row["name"] !== "");

  let upserted = 0;
  for (let i = 0; i < cacheRows.length; i += 100) {
    const batch = cacheRows.slice(i, i + 100);
    const { error } = await supabase
      .from("supplier_products_cache")
      .upsert(batch, { onConflict: "supplier_id,external_id", ignoreDuplicates: false });
    if (!error) upserted += batch.length;
  }

  await supabase.from("suppliers").update({ updated_at: new Date().toISOString() }).eq("id", supplier.id);

  return { fetched: allProducts.length, cached: upserted };
}