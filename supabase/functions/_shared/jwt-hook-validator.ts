/**
 * JWT Hook Validator — Shared module for Supabase Custom Access Token hooks.
 *
 * SECURITY VECTORS REMEDIATION — Phase 1
 * Requirement: SEC-JWT-01, SEC-JWT-02, SEC-JWT-03, SEC-JWT-04
 *
 * ## Why this exists
 *
 * Without server-side secret validation, any caller who discovers the Edge
 * Function URL can obtain company_id / user_role data by forging a JWT hook
 * payload. This module enforces that every request carries a valid
 * X-JWT-Hook-Signature header whose value matches the secret stored in
 * Supabase Vault (jwt_hook_secret_v1).
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
 * ## Secret rotation procedure
 *
 * Zero-downtime rotation via versioned Vault keys:
 *   1. Generate a new 32-byte hex secret: `openssl rand -hex 32`
 *   2. Store it in Vault as `jwt_hook_secret_v2`.
 *   3. Update Auth Hook signing secret in Supabase Dashboard → Auth → Hooks.
 *   4. Update `VAULT_SECRET_KEY` constant below from v1 → v2 and deploy.
 *   5. Wait for the previous isolate generation to cycle out (~minutes).
 *   6. Delete `jwt_hook_secret_v1` from Vault.
 *   IMPORTANT: Steps 3 and 4 must happen atomically — any request between them
 *   will fail validation. Schedule during low-traffic window if possible.
 *
 * ## Feature flag: JWT_HOOK_SECRET_ENABLED
 *
 * Set to "false" in local dev environments where Vault is not available.
 * This allows running the function locally without needing Vault configured.
 * NEVER set to "false" in production — it disables all hook authentication.
 *
 * ## Backward compatibility with SUPABASE_AUTH_HOOK_SECRET
 *
 * Deployments that used the old pattern (plain env var secret) are supported
 * during migration. If Vault lookup fails, the module falls back to reading
 * SUPABASE_AUTH_HOOK_SECRET from env. Once all environments have migrated to
 * Vault, this fallback can be removed.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JWTHookValidationResult {
  /** True if the request should be allowed to proceed. */
  valid: boolean;
  /** Human-readable reason (for audit logs only — NEVER expose to callers). */
  reason: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VAULT_SECRET_KEY = 'jwt_hook_secret_v1';
const SIGNATURE_HEADER = 'x-jwt-hook-signature';

// ── Timing-safe comparison ────────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing-based side-channel attacks.
 *
 * WHY: A naive `a === b` comparison short-circuits on the first differing
 * character. An attacker can measure response time differences to deduce how
 * many leading characters of their guess are correct — effectively turning an
 * O(n) brute-force into a series of O(1) oracle queries.
 *
 * HOW: This implementation always iterates to `maxLen` regardless of where the
 * mismatch occurs. The `result` accumulator uses bitwise OR so a single
 * non-zero XOR sets the result permanently, but the loop never breaks early.
 *
 * NOTE: `a.charCodeAt(i)` returns `NaN` for out-of-bounds indices.
 * `NaN || 0` evaluates to `0`, making XOR with itself harmless for length
 * padding. However, length inequality is captured separately in the initial
 * `result` seed so strings of different lengths always return false regardless
 * of content.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  // Seed result with 1 if lengths differ — they can never be equal
  let result = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    // charCodeAt returns NaN for out-of-bounds — XOR with itself = 0, harmless
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

// ── Vault secret fetcher ──────────────────────────────────────────────────────

/**
 * In-process secret cache for warm isolate reuse.
 *
 * WHY: Each Vault lookup is a network round-trip to the Supabase database.
 * Caching in module scope means a single warm isolate only pays this cost
 * once. Cold starts always fetch fresh (cache is null at module load).
 *
 * SECURITY NOTE: The cache is process-scoped — it is NOT shared between
 * isolates. A secret rotation takes effect on the next cold start of each
 * isolate. Call `clearSecretCache()` explicitly after rotation if you need
 * immediate propagation within the same isolate generation.
 */
let _cachedSecret: string | null = null;

/**
 * Fetch the JWT hook secret from Supabase Vault.
 * Uses the service role client to query `vault.decrypted_secrets`.
 *
 * Priority order for secret resolution:
 *   1. In-memory cache (warm isolate — avoids repeated Vault round-trips)
 *   2. Supabase Vault key `jwt_hook_secret_v1` (production path)
 *   3. `SUPABASE_AUTH_HOOK_SECRET` env var (backward compat / migration path)
 *
 * Falls back to SUPABASE_AUTH_HOOK_SECRET env var for backward compatibility
 * with existing deployments that haven't migrated to Vault yet.
 */
async function fetchHookSecret(): Promise<string | null> {
  if (_cachedSecret !== null) return _cachedSecret;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Backward-compatible fallback: use env var if Vault is not available
  const envSecret = Deno.env.get('SUPABASE_AUTH_HOOK_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey) {
    console.error('[jwt-hook-validator] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    // Fall back to env var so existing deployments keep working during migration
    _cachedSecret = envSecret || null;
    return _cachedSecret;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Supabase Vault exposes secrets via vault.decrypted_secrets view.
    // The service role can read from it directly.
    const { data, error } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', VAULT_SECRET_KEY)
      .maybeSingle();

    if (error || !data?.decrypted_secret) {
      console.warn(
        `[jwt-hook-validator] Could not read Vault secret "${VAULT_SECRET_KEY}":`,
        error?.message ?? 'not found',
      );
      // Fall back to env var — allows migration without downtime
      _cachedSecret = envSecret || null;
      return _cachedSecret;
    }

    _cachedSecret = data.decrypted_secret as string;
    console.log('[jwt-hook-validator] Vault secret loaded successfully');
    return _cachedSecret;
  } catch (err) {
    console.error('[jwt-hook-validator] Unexpected error fetching Vault secret:', err);
    // Fail-open to env var fallback so existing infrastructure isn't broken
    _cachedSecret = envSecret || null;
    return _cachedSecret;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate the JWT hook signature for an incoming request.
 *
 * Usage in custom-access-token:
 * ```ts
 * const { valid, reason } = await validateJWTHook(req);
 * if (!valid) {
 *   console.error('[custom-access-token] JWT hook validation failed:', reason);
 *   return new Response(JSON.stringify({ claims: {} }), {
 *     status: 200,
 *     headers: { 'Content-Type': 'application/json' },
 *   });
 * }
 * ```
 *
 * SEC-JWT-03: This MUST be called before any RLS or tenant-based logic.
 * SEC-JWT-04: On failure, return empty claims with HTTP 200 (hook requirement)
 *             and log a generic message. NEVER expose secret details in the response.
 */
export async function validateJWTHook(req: Request): Promise<JWTHookValidationResult> {
  // SEC-JWT-01: Feature flag check
  // JWT_HOOK_SECRET_ENABLED defaults to true (anything except the string "false"
  // enables validation). This allows `supabase secrets set JWT_HOOK_SECRET_ENABLED=false`
  // in local/staging environments where Vault is not available. Any other value
  // (including missing) keeps validation ON — fail-safe default.
  const enabled = Deno.env.get('JWT_HOOK_SECRET_ENABLED') !== 'false';
  if (!enabled) {
    console.warn('[jwt-hook-validator] Validation DISABLED via JWT_HOOK_SECRET_ENABLED=false');
    return { valid: true, reason: 'validation_disabled' };
  }

  // SEC-JWT-01: Header resolution with backward-compat fallback
  // Primary:  X-JWT-Hook-Signature header (new standard for this project)
  // Fallback: Authorization: Bearer <secret> (Supabase default hook auth format)
  // This dual-check means existing hooks that send Bearer tokens keep working
  // while new deployments can migrate to the custom header.
  const signature = req.headers.get(SIGNATURE_HEADER);
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const providedSecret = signature ?? bearerToken;

  if (!providedSecret) {
    console.error('[jwt-hook-validator] Missing X-JWT-Hook-Signature header');
    await _auditLog('MISSING_SIGNATURE', false);
    return { valid: false, reason: 'missing_signature' };
  }

  // SEC-JWT-02: Fetch secret from Vault (with env var fallback)
  const expectedSecret = await fetchHookSecret();

  if (!expectedSecret) {
    // No secret configured anywhere — this is a CRITICAL misconfiguration
    console.error('[jwt-hook-validator] CRITICAL: No hook secret configured (Vault or env var)');
    await _auditLog('NO_SECRET_CONFIGURED', false);
    return { valid: false, reason: 'no_secret_configured' };
  }

  // SEC-JWT-01: Timing-safe comparison to prevent timing attacks
  const matches = timingSafeEqual(providedSecret, expectedSecret);

  if (!matches) {
    console.error('[jwt-hook-validator] Invalid hook signature — request rejected');
    await _auditLog('INVALID_SIGNATURE', false);
    return { valid: false, reason: 'invalid_signature' };
  }

  console.log('[jwt-hook-validator] Hook signature validated successfully');
  await _auditLog('VALID_SIGNATURE', true);
  return { valid: true, reason: 'valid_signature' };
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

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    await supabase.from('security_audit_log').insert({
      event_type: 'JWT_HOOK_VALIDATION',
      event_detail: event,
      success,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Audit log failures are non-fatal — hook must always respond
  }
}

/**
 * Clear the in-memory secret cache.
 * Useful for testing and after secret rotation.
 */
export function clearSecretCache(): void {
  _cachedSecret = null;
}
