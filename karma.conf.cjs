// Karma config for /docs headless test runs.
// Picked up via `--config-file ./karma.conf.js` on the ng test
// command; default config in angular.json still uses Karma's
// built-in defaults.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/simplify-crm'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }],
    },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    singleRun: true,
    restartOnFileChange: false,
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--headless',
        ],
      },
    },
    // Restrict the suite to the docs feature so other broken specs
    // don't mask the ones we want to verify. The `files` array is
    // merged with the @angular-devkit/build-angular entry points.
    // Note: this only filters what the *karma server* serves; the
    // TypeScript compilation is driven by tsconfig.spec.json (or the
    // --ts-config override) and webpack still requires the imported
    // files to be in the TS program. We pass --ts-config at the CLI
    // to scope the program to `src/app/features/docs/**/*.spec.ts`,
    // and rely on Karma's client-side file resolution to skip the
    // non-docs specs at runtime.
    files: [
      { pattern: 'src/app/features/docs/**/*.spec.ts', type: 'module', watched: false },
    ],
  });
}
;
