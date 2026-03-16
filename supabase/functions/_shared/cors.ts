const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);
const ALLOW_ALL = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin");
  const headers: HeadersInit = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  const normalizedOrigin = origin?.toLowerCase();
  if (normalizedOrigin && (ALLOW_ALL || ALLOWED_ORIGINS.some(o => o.toLowerCase() === normalizedOrigin))) {
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
