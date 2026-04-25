if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js')
      .then(function (registration) {
        // SW registered successfully
      })
      .catch(function (registrationError) {
        // SW registration failed — app still works without offline support
      });
  });
}
