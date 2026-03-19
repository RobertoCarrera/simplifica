const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);
// Security: ALLOW_ALL_ORIGINS is only honoured in local (non-HTTPS) environments.
// If this flag is set to "true" in production it is silently ignored to prevent
// accidental full CORS opening. Production is detected via SUPABASE_URL scheme.
const _IS_PRODUCTION = (Deno.env.get("SUPABASE_URL") || "").startsWith("https://");
const ALLOW_ALL = !_IS_PRODUCTION && Deno.env.get("ALLOW_ALL_ORIGINS") === "true";

function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin");
  const headers: HeadersInit = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  const normalizedOrigin = origin?.toLowerCase();
  if (normalizedOrigin && (ALLOW_ALL || isLocalhostOrigin(origin) || ALLOWED_ORIGINS.some(o => o.toLowerCase() === normalizedOrigin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function handleCorsOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}
