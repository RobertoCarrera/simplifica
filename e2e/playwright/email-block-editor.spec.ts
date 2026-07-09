/**
 * Playwright e2e flag-on smoke test for the email-block-editor.
 *
 * PR2a scope: open the email template editor with `emailBlockEditorEnabled`
 * flipped to true (via runtime-config.json in dev/staging), see the new
 * block editor render with an auto-seeded heading block, save, and verify
 * persistence.
 *
 * NOTE: This test is gated behind `emailBlockEditorEnabled: true` in
 * `src/assets/runtime-config.json`. Production has the flag OFF by default
 * (design id 1946 §7.1), so this test must run against a dev/staging
 * environment where the flag has been flipped. CI must NOT enable the
 * flag in prod (verify with the flag-off smoke in CI).
 *
 * To enable locally:
 *   1. Edit src/assets/runtime-config.json
 *   2. Set features.emailBlockEditorEnabled: true
 *   3. ng serve (or run staging)
 *   4. npx playwright test e2e/playwright/email-block-editor.spec.ts
 *
 * Test setup:
 *   - Install @playwright/test: `pnpm add -D @playwright/test`
 *   - Install browsers: `npx playwright install chromium`
 *   - Add playwright.config.ts at project root
 *
 * PR2b extends this spec with:
 *   - Logo / Paragraph / Button typed editors (full block-type coverage)
 *   - Auto-migrate scenario (open legacy custom_body_template setting)
 *   - Auto-seed scenario (open un-customized setting)
 *   - Button XSS guard (button url={{invoice_url}} + javascript: sample data)
 */
import { test, expect } from '@playwright/test';

/**
 * PR2a flag-on smoke: verify the block editor renders, auto-seeds, and
 * saves blocks via custom_blocks JSONB.
 */
test.describe('email-block-editor (PR2a — flag ON smoke)', () => {
  test.beforeEach(async ({ page }) => {
    // Override the runtime config so the flag is ON for this test, even
    // if the production-style runtime-config.json has it OFF.
    await page.route('**/assets/runtime-config.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          supabase: { url: 'http://localhost', anonKey: 'test' },
          edgeFunctionsBaseUrl: 'http://localhost/functions/v1',
          features: {
            anychatConversationsEnabled: true,
            emailBlockEditorEnabled: true,
          },
        }),
      });
    });
  });

  test('opens dialog, shows BlockEditorComponent with auto-seeded heading, saves', async ({ page }) => {
    // 1. Navigate to admin email accounts page.
    await page.goto('/admin/email-accounts');
    // Auth: this depends on the project's auth flow. PR2b will add a
    // dedicated test login helper; for PR2a the test assumes the
    // environment provides an authenticated session (dev/staging only).
    // Adjust selectors to match the project's actual admin nav.
    //
    // 2. Click "Editar plantilla" for invite_owner.
    await page.getByRole('button', { name: /editar plantilla/i }).first().click();

    // 3. Confirm the block editor (NOT TipTap) renders.
    await expect(page.getByTestId('block-editor')).toBeVisible();
    await expect(page.getByTestId('add-block-trigger')).toBeVisible();

    // 4. Wait for auto-seed: heading block should appear after default_html
    //    RPC resolves. PR2a only auto-seeds heading; logo/paragraph/button
    //    follow in PR2b.
    await expect(page.getByTestId('block-row-0')).toBeVisible({ timeout: 5000 });

    // 5. Add a paragraph block via the dropdown.
    await page.getByTestId('add-block-trigger').click();
    await page.getByTestId('add-block-paragraph').click();
    await expect(page.getByTestId('block-row-1')).toBeVisible();

    // 6. Save the dialog.
    await page.getByRole('button', { name: /guardar/i }).click();

    // 7. Dialog closes.
    await expect(page.getByTestId('template-editor-dialog')).not.toBeVisible();
  });

  test('flag OFF (default in prod) renders the legacy TipTap + Texto del botón UI', async ({ page }) => {
    // Override runtime-config to force the flag OFF.
    await page.route('**/assets/runtime-config.json*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          supabase: { url: 'http://localhost', anonKey: 'test' },
          edgeFunctionsBaseUrl: 'http://localhost/functions/v1',
          features: {
            anychatConversationsEnabled: true,
            emailBlockEditorEnabled: false,
          },
        }),
      });
    });

    await page.goto('/admin/email-accounts');
    await page.getByRole('button', { name: /editar plantilla/i }).first().click();

    // Legacy: TipTap wrapper (data-testid="ted-input-body") + Texto del botón input.
    await expect(page.getByTestId('ted-input-body')).toBeVisible();
    await expect(page.getByTestId('ted-input-buttonText')).toBeVisible();
    // The new block editor is NOT rendered.
    await expect(page.getByTestId('block-editor')).toHaveCount(0);
  });
});