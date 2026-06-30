/**
 * Jest configuration for the Simplifica CRM unit test suite.
 *
 * Strategy (2026-06-17):
 *   - ts-jest preset for TypeScript on the fly.
 *   - jsdom env so specs that touch `document`, `navigator`,
 *     `localStorage` and `window` work (e.g. the language service spec).
 *   - Pure unit tests: services, helpers, and component methods that
 *     don't need Angular TestBed. These run reliably today.
 *   - Component specs that use TestBed are EXCLUDED via
 *     testPathIgnorePatterns for now. Migrating them to a proper
 *     Angular testing setup (jest-preset-angular or similar) is
 *     tracked as a separate task — it requires a bigger refactor of
 *     how we test components and was out of scope for the regression
 *     coverage that motivated this config.
 *
 * Notes:
 *   - moduleNameMapper mocks out CSS/SCSS/asset imports so the
 *     transformer doesn't choke on `import './foo.scss'`.
 *   - The `.cjs` extension is required because package.json has
 *     "type": "module"; jest.config.js would be parsed as ESM and
 *     `module.exports` would fail.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'http://localhost/',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: [
    '<rootDir>/src/app/shared/utils/**/*.spec.ts',
    '<rootDir>/src/app/shared/**/*.spec.ts',
  ],
  moduleNameMapper: {
    '\\.(scss|css|less|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$':
      '<rootDir>/src/__mocks__/styleMock.ts',
  },
  transform: {
    '^.+\\.(ts|js)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        diagnostics: {
          ignoreCodes: [151001],
        },
      },
    ],
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/supabase/',
  ],
};
