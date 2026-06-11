// Service Worker registration has been permanently disabled. The
// previous Service Worker was silently serving stale bundles to
// already-loaded tabs, masking deploys and breaking the "fix and
// refresh" workflow. With this file present in /public the angular.json
// "ignore" rule excludes it from the build, so the deployed app no
// longer ships any SW registration. The legacy /sw.js that some old
// tabs may still have installed will be replaced on the next page
// load by a self-unregistering SW shipped under the same path.
