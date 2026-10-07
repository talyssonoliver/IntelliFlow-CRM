import { test, expect, type Page } from '@playwright/test';
import { acceptCookieConsent } from './utils/cookie-consent';

/**
 * PG-126 — Public Product Tour + Feedback Widget golden-path E2E.
 *
 * Coverage:
 *  - First-visit auto-start on /features
 *  - Keyboard walk through the 4 tour steps
 *  - Seen flag persistence: auto-start is suppressed on reload
 *  - ?tour=1 override forces replay regardless of seen flag
 *  - TourTriggerButton on / links to /features?tour=1
 *  - PublicFeedbackFab opens the dialog and round-trips a submission
 */

test.describe('Public Product Tour + Feedback Widget (PG-126)', () => {
  test.beforeEach(async ({ context }) => {
    // Start each test with no cookies and a fresh localStorage. Clear only on a
    // tab's FIRST load: an init script also runs on page.reload(), and clearing
    // there wiped the seen flag the keyboard-walk test reloads to check.
    // sessionStorage survives a reload but not a new page.
    await context.clearCookies();
    await context.addInitScript(() => {
      try {
        if (!window.sessionStorage.getItem('e2e.storage-cleared')) {
          window.localStorage.clear();
          window.sessionStorage.setItem('e2e.storage-cleared', '1');
        }
      } catch {
        /* no-op */
      }
    });
  });

  test('features page auto-starts the tour for a first-visit visitor', async ({ page }) => {
    await page.goto('/features');
    await expect(page.getByTestId('tour-step-dialog')).toBeVisible({ timeout: 10_000 });
    // Step 1 title should be visible.
    await expect(page.getByText(/Welcome to Aurora/i)).toBeVisible();
  });

  test('keyboard walk advances through all 4 steps and sets seen flag', async ({ page }) => {
    await page.goto('/features');
    await expect(page.getByTestId('tour-step-dialog')).toBeVisible({
      timeout: 10_000,
    });

    // Step 1 → 2 → 3 → 4, then Done.
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('tour-next-button').click();
    }

    await expect(page.getByTestId('tour-step-dialog')).toBeHidden();

    // Seen flag set in localStorage.
    const seen = await page.evaluate(() =>
      window.localStorage.getItem('intelliflow.public.tour.features-v1.seen')
    );
    expect(seen).not.toBeNull();

    // Reload — tour should NOT auto-start the second time.
    await page.reload();
    await expect(page.getByTestId('tour-step-dialog')).toBeHidden();
  });

  test('?tour=1 replays the tour even after seen flag is set', async ({ page }) => {
    // Pre-seed the seen flag.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'intelliflow.public.tour.features-v1.seen',
          new Date().toISOString()
        );
      } catch {
        /* no-op */
      }
    });
    await page.goto('/features?tour=1');
    await expect(page.getByTestId('tour-step-dialog')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('home page exposes a TourTriggerButton link to /features?tour=1', async ({ page }) => {
    await page.goto('/');
    const link = page.getByTestId('tour-trigger-link');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toContain('/features?tour=1');
  });

  /** Open the public feedback dialog from /pricing and fill a 4-star rating + comment. */
  async function openAndFillFeedback(page: Page) {
    await page.goto('/pricing'); // any public route with PublicHeader + no tour
    // The first-visit consent dialog sits over the bottom-right FAB until answered.
    await acceptCookieConsent(page);
    const fab = page.getByTestId('public-feedback-fab');
    await expect(fab).toBeVisible({ timeout: 10_000 });
    await fab.click();

    const dialog = page.getByTestId('public-feedback-dialog');
    await expect(dialog).toBeVisible();

    // Fill 4-star rating. The radios are sr-only (stacked under the first star),
    // so click the visible star label a user clicks, which checks its radio.
    await dialog.locator('label[for="public-feedback-rating-4"]').click();
    await expect(page.getByTestId('public-feedback-rating-4')).toBeChecked();

    // Add a comment.
    await dialog.getByLabel(/Comment/i).fill('Testing tour submission.');
  }

  test('PublicFeedbackFab opens the dialog and accepts a rating and comment', async ({ page }) => {
    await openAndFillFeedback(page);
    await expect(page.getByTestId('public-feedback-submit')).toBeEnabled();
  });

  test('PublicFeedbackFab submits anonymous feedback', async ({ page }, testInfo) => {
    // public-feedback is limited to 1 submission per IP per 10 minutes
    // (public-feedback.router.ts, PublicRateLimiter). Every browser project in a
    // run shares one IP, so only one project can exercise the real round-trip;
    // the dialog itself is still covered in every project by the test above.
    test.skip(
      testInfo.project.name !== 'chromium',
      'public-feedback allows 1 submit per IP per 10 min; the round-trip runs in chromium only'
    );
    await openAndFillFeedback(page);

    await page.getByTestId('public-feedback-submit').click();

    // On success the confirmation appears.
    await expect(page.getByTestId('public-feedback-success')).toBeVisible({
      timeout: 10_000,
    });
  });
});
