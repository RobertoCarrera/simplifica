// This module overrides console.log to a no-op to silence logs in production
// It intentionally only replaces console.log and leaves other console methods intact.
// To revert, remove the import from `src/main.ts` and `src/main.server.ts`.
if (typeof window !== 'undefined' || typeof globalThis !== 'undefined') {
  try {
    // Keep a reference to the original in case someone needs to restore it later
    (globalThis as any).__original_console_log = (console && console.log) || (() => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    console.log = () => {};
  } catch (e) {
    // If overriding fails (readonly console), ignore silently
  }
}
