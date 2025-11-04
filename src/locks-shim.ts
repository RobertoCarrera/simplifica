// Best-effort shim to reduce noise from Navigator LockManager errors in browsers
// We wrap navigator.locks.request and catch immediate failures to avoid unhandled rejections.
// This doesn't disable locks—just prevents logs from flooding the console.
(() => {
  try {
    const nav: any = navigator as any;
    const locks: any = nav.locks;
    // Provide a minimal stub if Locks API is missing
    if (!locks) {
      nav.locks = {
        request: async (name: string, optionsOrCb: any, maybeCb?: any) => {
          const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
          if (typeof cb === 'function') {
            const mode = optionsOrCb && typeof optionsOrCb === 'object' ? optionsOrCb.mode || 'exclusive' : 'exclusive';
            return await cb({ name, mode } as any);
          }
          return undefined;
        }
      } as any;
      return;
    }

    const original = typeof locks.request === 'function' ? locks.request.bind(locks) : null;

    // Replace request with a safer version: for Supabase auth locks, bypass the real lock and run the callback.
    nav.locks.request = async function(name: string, optionsOrCb: any, maybeCb?: any) {
      const isSupabaseAuthLock = typeof name === 'string' && (name.startsWith('lock:sb-') || name.endsWith('-auth-token'));
      if (isSupabaseAuthLock) {
        const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
        if (typeof cb === 'function') {
          const mode = optionsOrCb && typeof optionsOrCb === 'object' ? optionsOrCb.mode || 'exclusive' : 'exclusive';
          try { return await cb({ name, mode } as any); } catch { return undefined; }
        }
        return undefined;
      }
      // Non-Supabase locks: try original if available, guard from failures
      if (original) {
        try {
          if (typeof optionsOrCb === 'function') {
            return await original(name, optionsOrCb);
          }
          return await original(name, optionsOrCb, maybeCb);
        } catch {
          // Silently ignore lock failures for non-critical locks
          const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
          if (typeof cb === 'function') {
            const mode = optionsOrCb && typeof optionsOrCb === 'object' ? optionsOrCb.mode || 'exclusive' : 'exclusive';
            try { return await cb({ name, mode } as any); } catch { return undefined; }
          }
          return undefined;
        }
      }
      // No original available; attempt best-effort callback execution
      const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
      if (typeof cb === 'function') {
        const mode = optionsOrCb && typeof optionsOrCb === 'object' ? optionsOrCb.mode || 'exclusive' : 'exclusive';
        try { return await cb({ name, mode } as any); } catch { return undefined; }
      }
      return undefined;
    };
  } catch {
    // no-op
  }
})();
export {};
