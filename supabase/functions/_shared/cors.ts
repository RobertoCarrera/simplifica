const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map(o => o.trim())
  .filter(o => Boolean(o) && o !== "*"); // Never allow wildcard — explicit origins only

// Localhost origins for development — always allowed
const LOCALHOST_ORIGINS = ['http://localhost:4200', 'http://localhost:5173'];

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin");
  const headers: HeadersInit = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-csrf-token",
    Vary: "Origin",
  };

  if (origin && (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_ORIGINS.includes(origin))) {
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
