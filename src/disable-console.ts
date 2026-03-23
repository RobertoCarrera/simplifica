// Silences ALL console output in SSR (server-side rendering) context.
// On the server, any leaked console.* output is visible in server logs and may
// expose stack traces, PII or architectural details.
// Browser-side suppression is handled in main.ts via environment.production.
// To revert, remove the import from `src/main.server.ts`.
if (typeof window === 'undefined') {
  // Running in SSR / Node / Deno — suppress everything
  try {
    const noop = () => {};
    console.log   = noop;
    console.info  = noop;
    console.warn  = noop;
    console.debug = noop;
    // Also suppress console.error on the server: stack traces in server logs
    // can reveal internal paths, dependency versions and business logic.
    console.error = noop;
  } catch (_e) {
    // readonly console in some environments — ignore
  }
}

export {};
