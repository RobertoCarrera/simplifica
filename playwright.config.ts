/**
 * Playwright config for the simplifica-crm e2e suite (PR2a scaffolding).
 *
 * Run with: `npx playwright test e2e/playwright/`
 *
 * Browser: chromium headless only (matches CI environment).
 * Base URL: http://localhost:4200 (default `ng serve` port).
 *
 * NOTE: Playwright is NOT installed as a project dependency yet. To
 * activate this suite:
 *   pnpm add -D @playwright/test
 *   npx playwright install chromium
 *
 * The PR2a flag-on smoke (email-block-editor.spec.ts) requires the dev
 * environment to override `assets/runtime-config.json` so the
 * `emailBlockEditorEnabled` feature flag is true. The spec uses
 * `page.route()` to do that override inline.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/playwright',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm start',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});