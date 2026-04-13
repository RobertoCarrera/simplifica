// Early console proxy: suppress log/info/debug while preserving warn/error
(function () {
  try {
    var origConsole = (typeof console !== 'undefined') ? console : {};
    var handler = {
      get(target, prop) {
        if (prop === 'log' || prop === 'info' || prop === 'debug') {
          return function () { }; // no-op for noisy methods
        }
        // bind methods to original console to preserve context
        var v = target[prop];
        if (typeof v === 'function') return v.bind(target);
        return v;
      }
    };
    try {
      // Replace window.console with a Proxy so code that reads console.* sees the proxy
      window.console = new Proxy(origConsole, handler);
    } catch (e) {
      // Some environments disallow replacing console; try to patch methods directly
      try { window.console.log = function () { }; } catch (e) { }
      try { window.console.info = function () { }; } catch (e) { }
      try { window.console.debug = function () { }; } catch (e) { }
    }

    // Wrap navigator.locks.request to avoid failures when locks cannot be acquired
    if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
      try {
        const origRequest = navigator.locks.request.bind(navigator.locks);
        navigator.locks.request = function (name, options, callback) {
          try {
            const maybeCallback = (typeof options === 'function') ? options : callback;
            return origRequest(name, options, callback).catch(function (err) {
              // If lock acquisition fails, fall back to executing the callback without the lock
              try { return Promise.resolve(maybeCallback()); } catch (e) { return Promise.reject(e); }
            });
          } catch (e) {
            try { const cb = (typeof options === 'function') ? options : callback; return Promise.resolve(cb()); } catch (err) { return Promise.reject(err); }
          }
        };
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore shim errors
  }
})();

// Dynamic viewport height fix for iOS Safari & modern browsers
(function viewportHeightFix() {
  function setVH() {
    try {
      var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--dvh', vh + 'px');
    } catch (e) { /* ignore */ }
  }
  setVH();
  window.addEventListener('resize', setVH);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVH);
  }
})();

// Detect iOS and add class for specific styling
(function detectIOS() {
  try {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isIOS) {
      document.body.classList.add('ios-device');
      if (isStandalone) {
        document.body.classList.add('ios-pwa');
      }
    }
  } catch (e) { /* ignore */ }
})();
