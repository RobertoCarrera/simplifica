/**
 * CSRF Middleware for Edge Functions
 *
 * Provides a Higher-Order Function (HOF) wrapper that enforces CSRF token validation
 * on state-changing endpoints before the handler is invoked.
 *
 * Usage:
 *   import { withCsrf } from '../_shared/csrf-middleware.ts';
 *
 *   serve(withCsrf(async (req) => {
 *     // handler — only reached if CSRF is valid
 *   }));
 *
 * Requirements:
 *   - CSRF_SECRET env var MUST be set as an Edge Function secret in the Supabase dashboard.
 *   - The calling client must include `X-CSRF-Token: <token>` in the request header.
 *   - The CSRF token must have been obtained from the `get-csrf-token` function.
 *
 * Exempt endpoints (do NOT wrap with withCsrf):
 *   - booking-public: uses API key + Turnstile bot protection instead
 *   - public-payment-info: unauthenticated, token-gated (payment link token)
 *   - public-payment-redirect: unauthenticated, token-gated (payment link token)
 *   - payment-webhook-stripe: provider-signed (Stripe webhook signature)
 *   - payment-webhook-paypal: provider-signed (PayPal webhook signature)
 *   - custom-access-token: JWT hook — called by Supabase internals, not the user browser
 *   - get-csrf-token: issues tokens, does not consume them
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractCsrfToken, validateCsrfToken } from './csrf-protection.ts';
import { getCorsHeaders } from './cors.ts';

type Handler = (req: Request) => Promise<Response>;

/**
 * Wrap a handler with CSRF token validation.
 *
 * Flow:
 *  1. Skip validation for OPTIONS requests (CORS preflight).
 *  2. Extract the JWT from the Authorization header and resolve userId.
 *  3. Extract the CSRF token from the X-CSRF-Token header.
 *  4. Validate the token via HMAC against CSRF_SECRET.
 *  5. If valid → invoke handler. If not → return 403.
 */
export function withCsrf(handler: Handler): Handler {
  return async (req: Request): Promise<Response> => {
    // Allow CORS preflight through without CSRF check
    if (req.method === 'OPTIONS') {
      return handler(req);
    }

    // Only enforce CSRF on state-changing methods
    const statefulMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!statefulMethods.includes(req.method)) {
      return handler(req);
    }

    const corsHeaders = getCorsHeaders(req);

    // Resolve the authenticated user from the JWT so we can bind CSRF token to userId
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!bearerToken) {
      return new Response(JSON.stringify({ error: 'Authorization token required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    // Extract and validate CSRF token
    const csrfToken = extractCsrfToken(req);
    if (!csrfToken) {
      return new Response(
        JSON.stringify({ error: 'Missing CSRF token. Include X-CSRF-Token header.' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const isValid = await validateCsrfToken(csrfToken, userId);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid or expired CSRF token.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CSRF validated — pass request to the actual handler
    return handler(req);
  };
}
