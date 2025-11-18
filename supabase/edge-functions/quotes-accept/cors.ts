// @ts-nocheck
export function parseAllowedOrigins() {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  const list = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { allowAll, list };
}

export function originAllowed(origin?: string | null): boolean {
  const { allowAll, list } = parseAllowedOrigins();
  if (allowAll) return true;
  if (!origin) return false;
  return list.includes(origin);
}

export function corsHeaders(origin?: string | null, methods = "POST, OPTIONS") {
  const { allowAll } = parseAllowedOrigins();
  const allowed = originAllowed(origin);
  const allowOrigin = allowed && origin ? origin : (allowAll ? "*" : "");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  } as Record<string, string>;
}
