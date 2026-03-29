/**
 * JWT Hook Validator — Shared module for Supabase Custom Access Token hooks.
 *
 * SECURITY VECTORS REMEDIATION — Phase 1 (v2: Standard Webhooks)
 * Requirement: SEC-JWT-01, SEC-JWT-02, SEC-JWT-03, SEC-JWT-04
 *
 * ## Why this exists
 *
 * Without server-side secret validation, any caller who discovers the Edge
 * Function URL can obtain company_id / user_role data by forging a JWT hook
 * payload. This module enforces that every request carries a valid Standard
 * Webhooks HMAC signature sent by Supabase Auth in the standard webhook headers
 * (webhook-id, webhook-timestamp, webhook-signature).
 *
 * ## Authentication mechanism
 *
 * Supabase HTTPS hooks use the Standard Webhooks protocol (https://standardwebhooks.com/).
 * Supabase signs each request with HMAC and sends the signature in the
 * `webhook-signature` header. The signing secret is set in Dashboard → Auth → Hooks
 * and is stored as the env var `CUSTOM_ACCESS_TOKEN_SECRET` (format: `v1,whsec_<base64>`).
 *
 * The `v1,whsec_` prefix must be stripped before passing the raw base64 secret
 * to the Webhook constructor.
 *
 * ## Fail-closed strategy (not fail-open)
 *
 * Unlike the rate limiter (which is fail-open to preserve availability), this
 * validator is FAIL-CLOSED. On an invalid or missing signature it returns HTTP
 * 200 with empty claims — never 4xx, because Supabase Auth Hook spec requires
 * a 200 response from all hook implementations. Empty claims cause the JWT to
 * lack company_id and user_role, effectively denying access to tenant data
 * without revealing WHY access was denied to the caller.
 *
 * ## Feature flag: JWT_HOOK_SECRET_ENABLED
 *
 * Set to "false" in local dev environments where the secret is not available.
 * NEVER set to "false" in production — it disables all hook authentication.
 *
 * ## Body consumption note
 *
 * validateJWTHook() calls req.text() internally to verify the HMAC signature
 * (the signature covers the raw body bytes). Because a Request body can only be
 * consumed once, the parsed body text is returned in the result so that the
 * caller (index.ts) does NOT attempt to call req.text() / req.json() again.
 * Always use `result.body` in index.ts instead of re-reading the request.
 */

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JWTHookValidationResult {
  /** True if the request should be allowed to proceed. */
  valid: boolean;
  /** Human-readable reason (for audit logs only — NEVER expose to callers). */
  reason: string;
  /**
   * Raw request body text — only populated when valid === true.
   *
   * IMPORTANT: validateJWTHook consumes req.text() to verify the HMAC
   * signature. The caller MUST use this field instead of reading req again.
   */
  body?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate the JWT hook signature for an incoming Supabase HTTPS hook request.
 *
 * Uses Standard Webhooks (https://standardwebhooks.com/) — the protocol used
 * by Supabase for all HTTPS Auth hooks. Verification is based on HMAC
 * signatures sent in the `webhook-id`, `webhook-timestamp`, and
 * `webhook-signature` headers.
 *
 * Usage in custom-access-token:
 * ```ts
 * const { valid, reason, body } = await validateJWTHook(req);
 * if (!valid) {
 *   console.error('[custom-access-token] JWT hook validation failed:', reason);
 *   return new Response(JSON.stringify({ claims: {} }), {
 *     status: 200,
 *     headers: { 'Content-Type': 'application/json' },
 *   });
 * }
 * // Use body — do NOT call req.text() / req.json() again
 * const payload = JSON.parse(body!);
 * ```
 *
 * SEC-JWT-03: This MUST be called before any RLS or tenant-based logic.
 * SEC-JWT-04: On failure, return empty claims with HTTP 200 (hook requirement)
 *             and log a generic message. NEVER expose secret details in the response.
 */
export async function validateJWTHook(req: Request): Promise<JWTHookValidationResult> {
  // SEC-JWT-01: Feature flag check
  // JWT_HOOK_SECRET_ENABLED defaults to true (anything except the string "false"
  // enables validation). Set to "false" in local/staging environments where the
  // webhook secret is not available. Any other value (including missing) keeps
  // validation ON — fail-safe default.
  const enabled = Deno.env.get('JWT_HOOK_SECRET_ENABLED') !== 'false';
  if (!enabled) {
    console.warn('[jwt-hook-validator] Validation DISABLED via JWT_HOOK_SECRET_ENABLED=false');
    // Body must still be read so callers can use it
    const body = await req.text();
    return { valid: true, reason: 'validation_disabled', body };
  }

  const rawSecret = Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET') ?? '';
  console.log('[jwt-hook-validator] Secret configured:', !!rawSecret, 'length:', rawSecret.length);

  if (!rawSecret) {
    console.error('[jwt-hook-validator] CRITICAL: CUSTOM_ACCESS_TOKEN_SECRET not configured');
    await _auditLog('NO_SECRET_CONFIGURED', false);
    return { valid: false, reason: 'no_secret_configured' };
  }

  // Strip the 'v1,whsec_' prefix — Webhook constructor expects raw base64.
  // Supabase Dashboard → Auth → Hooks shows the secret as "v1,whsec_<base64>".
  // The StandardWebhooks Webhook class only wants the base64 portion.
  const base64Secret = rawSecret.replace('v1,whsec_', '');

  try {
    // Read body FIRST — req.text() can only be called once
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);

    const wh = new Webhook(base64Secret);
    // wh.verify() throws a WebhookVerificationError if the signature is invalid,
    // the timestamp is stale (> 5 min), or required headers are missing.
    wh.verify(payload, headers);

    console.log('[jwt-hook-validator] Webhook signature validated successfully');
    await _auditLog('VALID_SIGNATURE', true);
    return { valid: true, reason: 'valid_signature', body: payload };
  } catch (err) {
    console.error('[jwt-hook-validator] Webhook verification failed:', err);
    await _auditLog('INVALID_SIGNATURE', false);
    return { valid: false, reason: 'invalid_signature' };
  }
}

// ── Audit log helper ──────────────────────────────────────────────────────────

/**
 * Write a validation result to the audit log table.
 * Non-blocking — failures here must not affect the hook response.
 */
async function _auditLog(event: string, success: boolean): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) return;

    // Direct REST API call — avoids importing supabase-js (cold-start overhead)
    await fetch(`${supabaseUrl}/rest/v1/security_audit_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        event_type: 'JWT_HOOK_VALIDATION',
        event_detail: event,
        success,
        created_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Audit log failures are non-fatal — hook must always respond
  }
}
