/**
 * Shared security utilities for all edge functions.
 * Import and use in every function response.
 */

/** Standard security headers for all API responses */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
};

/**
 * Merge security headers into an existing headers object.
 * Use on every Response to harden API endpoints.
 */
export function withSecurityHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  return { ...SECURITY_HEADERS, ...headers };
}

/**
 * Extract real client IP from request headers.
 * Standardized across all edge functions — always use this instead of ad-hoc header reads.
 * Priority: CF-Connecting-IP (Cloudflare) → X-Real-IP → first X-Forwarded-For entry.
 */
export function getClientIP(req: Request): string {
  // Cloudflare sets this header and it cannot be spoofed by clients
  const cf = req.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();

  // Set by trusted reverse proxies
  const realIp = req.headers.get('X-Real-IP');
  if (realIp) return realIp.trim();

  // Take only the first IP (client IP) from X-Forwarded-For — ignore any appended proxy IPs
  const forwarded = req.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();

  return 'unknown';
}

/**
 * UUID v4 validation regex.
 * Use before passing any user-supplied ID into a database query.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Sanitize a plain-text string for safe use in email bodies.
 * Strips HTML tags and limits length.
 */
export function sanitizeText(value: unknown, maxLength = 2000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/[<>"'&]/g, (c) =>                    // encode remaining special chars
      ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' }[c] ?? c))
    .slice(0, maxLength)
    .trim();
}

/**
 * Build a standardized JSON error response with security headers baked in.
 */
export function errorResponse(
  status: number,
  error: string,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: withSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
    }),
  });
}

/**
 * Build a standardized JSON success response with security headers baked in.
 */
export function jsonResponse(
  status: number,
  body: unknown,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
    }),
  });
}
