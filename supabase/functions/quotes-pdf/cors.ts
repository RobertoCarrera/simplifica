// @ts-nocheck
export function parseAllowedOrigins() {
  const list = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { list };
}

export function originAllowed(origin?: string | null): boolean {
  const { list } = parseAllowedOrigins();
  if (!origin) return false;
  return list.includes(origin);
}

export function corsHeaders(origin?: string | null, methods = "GET, OPTIONS") {
  const allowed = originAllowed(origin);
  const allowOrigin = allowed && origin ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  } as Record<string, string>;
}
