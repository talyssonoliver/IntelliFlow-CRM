/**
 * Authenticated QA matrix — module gating at the UI tier.
 *
 * Navigating to a gated route (/cases → LEGAL) must render the ModulePaywall for
 * a non-entitled tenant and the real content for an entitled one. This is the
 * frontend counterpart to the API entitlement matrix, and it validates that
 * ModuleGate is now PLAN-based (the tenant-admin bypass was removed — all QA
 * personas are ADMIN, so before the fix a STARTER admin wrongly saw the content).
 *
 * Browser test: uses each persona's storageState (not cleared).
 */
import { test, expect } from '@playwright/test';
import { personaStatePath } from '../fixtures/qa-personas';

const CASES_ROUTE = '/cases';
const PAYWALL_HEADING = /Legal Module/i; // ModulePaywall renders "<label> Module"

const CASES = [
  { key: 'starter', entitled: false },
  { key: 'professional', entitled: true },
  { key: 'enterprise', entitled: true },
] as const;

for (const { key, entitled } of CASES) {
  test.describe(`persona ${key} on ${CASES_ROUTE}`, () => {
    test.use({ storageState: personaStatePath(key) });

    test(`${entitled ? 'sees the LEGAL content' : 'is shown the LEGAL paywall'}`, async ({
      page,
    }) => {
      await page.goto(CASES_ROUTE);
      await page.waitForLoadState('networkidle');

      const paywall = page.getByRole('heading', { name: PAYWALL_HEADING });
      if (entitled) {
        await expect(paywall).toHaveCount(0); // content rendered, not the paywall
        await expect(page).not.toHaveURL(/\/login/);
      } else {
        await expect(paywall).toBeVisible({ timeout: 15_000 }); // gated → upgrade CTA
      }
    });
  });
}
