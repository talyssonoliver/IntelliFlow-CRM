import { test, expect } from '@playwright/test';

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
    // Start each test with no cookies and a fresh localStorage.
    await context.clearCookies();
    await context.addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch {
        /* no-op */
      }
    });
  });

  test('features page auto-starts the tour for a first-visit visitor', async ({ page }) => {
    await page.goto('/features');
    await expect(page.getByTestId('tour-step-dialog')).toBeVisible({ timeout: 10_000 });
    // Step 1 title should be visible.
    await expect(page.getByText(/Welcome to IntelliFlow/i)).toBeVisible();
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

  test('PublicFeedbackFab opens the dialog and submits anonymous feedback', async ({ page }) => {
    await page.goto('/pricing'); // any public route with PublicHeader + no tour
    const fab = page.getByTestId('public-feedback-fab');
    await expect(fab).toBeVisible({ timeout: 10_000 });
    await fab.click();

    const dialog = page.getByTestId('public-feedback-dialog');
    await expect(dialog).toBeVisible();

    // Fill 4-star rating.
    await page.getByTestId('public-feedback-rating-4').click();

    // Add a comment.
    await dialog.getByLabel(/Comment/i).fill('Testing tour submission.');

    // Submit.
    await page.getByTestId('public-feedback-submit').click();

    // On success the confirmation appears.
    await expect(page.getByTestId('public-feedback-success')).toBeVisible({
      timeout: 10_000,
    });
  });
});
