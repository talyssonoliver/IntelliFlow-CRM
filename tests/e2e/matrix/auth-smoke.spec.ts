/**
 * Auth fixture smoke — proves each persona's storageState lands AUTHENTICATED in
 * the real browser (the unlock for the ~100 existing authed specs).
 *
 * An unauthenticated visit to a protected route bounces to /login; a persona with
 * a valid injected session stays on the route. Runs in the `authenticated`
 * project (depends on `setup`, which mints fresh tokens first).
 */
import { test, expect } from '@playwright/test';
import { QA_PERSONAS, personaStatePath } from '../fixtures/qa-personas';

for (const persona of QA_PERSONAS) {
  test.describe(`persona ${persona.key} (${persona.plan})`, () => {
    test.use({ storageState: personaStatePath(persona.key) });

    test('lands authenticated on a protected route (no /login bounce)', async ({ page }) => {
      await page.goto('/dashboard');
      // Give the client auth bootstrap a beat to settle, then assert we were not
      // redirected to the login page.
      await page.waitForLoadState('networkidle');
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
}
