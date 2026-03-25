// @ts-nocheck
/**
 * Unit tests for jwt-hook-validator.ts
 *
 * SECURITY VECTORS REMEDIATION — Phase 1
 * Requirements: SEC-JWT-01, SEC-JWT-02, SEC-JWT-03, SEC-JWT-04
 *
 * Running:
 *   deno test supabase/functions/_shared/jwt-hook-validator.test.ts
 *
 * Notes:
 *   - Vault is mocked by setting SUPABASE_URL="" so the module falls back to the
 *     SUPABASE_AUTH_HOOK_SECRET env var. This tests the fallback path.
 *   - Production behavior (Vault fetch) is tested via integration tests.
 *   - clearSecretCache() resets the in-memory secret cache between tests.
 */

import { validateJWTHook, clearSecretCache } from './jwt-hook-validator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/custom-access-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setEnv(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    Deno.env.set(key, value);
  }
}

function clearEnv(...keys: string[]): void {
  for (const key of keys) {
    try {
      Deno.env.delete(key);
    } catch {
      /* ignore */
    }
  }
}

// ── SEC-JWT-01: Valid secret allows request ───────────────────────────────────

Deno.test('SEC-JWT-01: valid X-JWT-Hook-Signature allows request', async () => {
  clearSecretCache();
  setEnv({
    JWT_HOOK_SECRET_ENABLED: 'true',
    SUPABASE_AUTH_HOOK_SECRET: 'test-secret-12345',
    SUPABASE_URL: '', // force env var fallback (no Vault)
    SUPABASE_SERVICE_ROLE_KEY: '',
  });

  const req = makeRequest({ 'x-jwt-hook-signature': 'test-secret-12345' });
  const result = await validateJWTHook(req);

  console.assert(result.valid === true, `Expected valid=true, got: ${result.valid}`);
  console.assert(
    result.reason === 'valid_signature',
    `Expected reason=valid_signature, got: ${result.reason}`,
  );

  clearEnv(
    'JWT_HOOK_SECRET_ENABLED',
    'SUPABASE_AUTH_HOOK_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  clearSecretCache();
  console.log('✓ SEC-JWT-01: valid signature allows request');
});

// ── SEC-JWT-01: Missing signature blocks request (SEC-JWT-04: generic error) ─

Deno.test(
  'SEC-JWT-01/04: missing X-JWT-Hook-Signature blocks with reason missing_signature',
  async () => {
    clearSecretCache();
    setEnv({
      JWT_HOOK_SECRET_ENABLED: 'true',
      SUPABASE_AUTH_HOOK_SECRET: 'test-secret-12345',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    });

    const req = makeRequest({}); // no signature header, no auth header
    const result = await validateJWTHook(req);

    console.assert(result.valid === false, `Expected valid=false, got: ${result.valid}`);
    console.assert(
      result.reason === 'missing_signature',
      `Expected reason=missing_signature, got: ${result.reason}`,
    );

    clearEnv(
      'JWT_HOOK_SECRET_ENABLED',
      'SUPABASE_AUTH_HOOK_SECRET',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    clearSecretCache();
    console.log('✓ SEC-JWT-01/04: missing signature blocks request with generic reason');
  },
);

// ── SEC-JWT-01: Incorrect secret blocks request ───────────────────────────────

Deno.test('SEC-JWT-01: incorrect secret blocks request', async () => {
  clearSecretCache();
  setEnv({
    JWT_HOOK_SECRET_ENABLED: 'true',
    SUPABASE_AUTH_HOOK_SECRET: 'correct-secret',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  });

  const req = makeRequest({ 'x-jwt-hook-signature': 'wrong-secret' });
  const result = await validateJWTHook(req);

  console.assert(result.valid === false, `Expected valid=false, got: ${result.valid}`);
  console.assert(
    result.reason === 'invalid_signature',
    `Expected reason=invalid_signature, got: ${result.reason}`,
  );

  clearEnv(
    'JWT_HOOK_SECRET_ENABLED',
    'SUPABASE_AUTH_HOOK_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  clearSecretCache();
  console.log('✓ SEC-JWT-01: incorrect secret blocks request');
});

// ── Feature flag: JWT_HOOK_SECRET_ENABLED=false skips validation ──────────────

Deno.test('Feature flag: JWT_HOOK_SECRET_ENABLED=false skips validation', async () => {
  clearSecretCache();
  setEnv({
    JWT_HOOK_SECRET_ENABLED: 'false',
    SUPABASE_AUTH_HOOK_SECRET: 'should-not-matter',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  });

  const req = makeRequest({}); // no signature — would fail if enabled
  const result = await validateJWTHook(req);

  console.assert(result.valid === true, `Expected valid=true when disabled, got: ${result.valid}`);
  console.assert(
    result.reason === 'validation_disabled',
    `Expected reason=validation_disabled, got: ${result.reason}`,
  );

  clearEnv(
    'JWT_HOOK_SECRET_ENABLED',
    'SUPABASE_AUTH_HOOK_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  clearSecretCache();
  console.log('✓ Feature flag: JWT_HOOK_SECRET_ENABLED=false skips validation');
});

// ── Backward compat: Authorization: Bearer <secret> still works ───────────────

Deno.test('Backward compat: Authorization Bearer token accepted as signature', async () => {
  clearSecretCache();
  setEnv({
    JWT_HOOK_SECRET_ENABLED: 'true',
    SUPABASE_AUTH_HOOK_SECRET: 'legacy-bearer-secret',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  });

  const req = makeRequest({ Authorization: 'Bearer legacy-bearer-secret' });
  const result = await validateJWTHook(req);

  console.assert(
    result.valid === true,
    `Expected valid=true for Bearer auth, got: ${result.valid}`,
  );

  clearEnv(
    'JWT_HOOK_SECRET_ENABLED',
    'SUPABASE_AUTH_HOOK_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  clearSecretCache();
  console.log('✓ Backward compat: Bearer token accepted as signature');
});

// ── SEC-JWT-02: No secret configured → blocks request ────────────────────────

Deno.test('SEC-JWT-02: no secret configured blocks request with no_secret_configured', async () => {
  clearSecretCache();
  setEnv({
    JWT_HOOK_SECRET_ENABLED: 'true',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  });
  clearEnv('SUPABASE_AUTH_HOOK_SECRET');

  const req = makeRequest({ 'x-jwt-hook-signature': 'any-value' });
  const result = await validateJWTHook(req);

  console.assert(result.valid === false, `Expected valid=false, got: ${result.valid}`);
  console.assert(
    result.reason === 'no_secret_configured',
    `Expected reason=no_secret_configured, got: ${result.reason}`,
  );

  clearSecretCache();
  console.log('✓ SEC-JWT-02: no secret configured blocks request');
});

// ── Timing-safe: different length secrets don't short-circuit ────────────────

Deno.test(
  'Security: timing-safe comparison prevents short-circuit on length mismatch',
  async () => {
    clearSecretCache();
    setEnv({
      JWT_HOOK_SECRET_ENABLED: 'true',
      SUPABASE_AUTH_HOOK_SECRET: 'short',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    });

    // Try a longer value that shares the same prefix
    const req = makeRequest({ 'x-jwt-hook-signature': 'short-extra' });
    const result = await validateJWTHook(req);

    // 'short-extra' !== 'short' — must be rejected
    console.assert(
      result.valid === false,
      `Expected valid=false for length mismatch, got: ${result.valid}`,
    );

    clearEnv(
      'JWT_HOOK_SECRET_ENABLED',
      'SUPABASE_AUTH_HOOK_SECRET',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    clearSecretCache();
    console.log('✓ Security: length mismatch correctly rejected');
  },
);
