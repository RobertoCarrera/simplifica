// Best-effort shim to reduce noise from Navigator LockManager errors in browsers
// We wrap navigator.locks.request and catch immediate failures to avoid unhandled rejections.
// This doesn't disable locks—just prevents logs from flooding the console.
(() => {
  try {
    const locks: any = (navigator as any).locks;
    if (!locks || typeof locks.request !== 'function') return;
    const original = locks.request.bind(locks);
    (navigator as any).locks.request = async function(name: string, optionsOrCb: any, maybeCb?: any) {
      try {
        // Support both signatures: (name, options, cb) and (name, cb)
        if (typeof optionsOrCb === 'function') {
          return await original(name, optionsOrCb);
        }
        return await original(name, optionsOrCb, maybeCb);
      } catch (e: any) {
        // Swallow specific immediate acquire timeout errors
        if (e && String(e.name || e.message).includes('NavigatorLockAcquireTimeoutError')) {
          return undefined;
        }
        throw e;
      }
    };
  } catch {
    // no-op
  }
})();
export {};
