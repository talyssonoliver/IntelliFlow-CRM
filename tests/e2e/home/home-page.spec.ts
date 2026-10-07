/**
 * Home Page E2E Tests for IntelliFlow CRM (PG-164)
 *
 * 5 Playwright scenarios covering:
 * 1. Public home page rendering (unauthenticated)
 * 2. Auth redirect for protected routes
 * 3. Insight card click navigation (auth required)
 * 4. Quick action navigation (auth required)
 * 5. Pinned section & edit sheet (auth required)
 *
 * Scenarios 3-5 require E2E_AUTH_ENABLED=true environment variable.
 * Without it, they are gracefully skipped.
 */

import { test, expect } from '@playwright/test';

test.describe('Home Page E2E', () => {
  // =========================================================================
  // Scenario 1: Public Home Page (AC-001)
  // =========================================================================
  test.describe('Scenario 1: Public Home Page', () => {
    // This suite asserts the UNauthenticated marketing home. Under the
    // `authenticated` project the persona storageState would keep the user signed
    // in — and auth tokens now live in localStorage, so clearing cookies alone no
    // longer logs out. Drop the whole storageState to get a truly clean context.
    test.use({ storageState: { cookies: [], origins: [] } });
    test.beforeEach(async ({ context }) => {
      await context.clearCookies();
    });

    // Since #741 the public home is the Aurora landing (AuroraLandingPage). The
    // old page's hero ("Move faster, stay governed"), its 3 hero stats, 3 value
    // pillars and "Start free trial" / "Talk to sales" CTAs no longer exist; these
    // check the same three things on the page that replaced it.
    test('should render public home page with hero section', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('main#aurora-main')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'The CRM that works your pipeline for you.'
      );
    });

    test('should display the proof strip stats', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // The product facts under the hero (ProofStrip): four stats.
      await expect(page.locator('.proof .stat')).toHaveCount(4);
    });

    test('should have CTAs linking to signup and contact', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const heroCtas = page.locator('.stage .cta-row');
      const getStarted = heroCtas.getByRole('link', { name: 'Get started' });
      await expect(getStarted).toBeVisible();
      await expect(getStarted).toHaveAttribute('href', '/signup');

      const bookDemo = heroCtas.getByRole('link', { name: 'Book a demo' });
      await expect(bookDemo).toBeVisible();
      await expect(bookDemo).toHaveAttribute('href', '/contact');

      // The closing call to action at the bottom of the page (FinalCta).
      await expect(page.locator('section.aurora-final')).toBeAttached();
    });
  });

  // =========================================================================
  // Scenario 2: Auth Redirect (AC-002)
  // =========================================================================
  test.describe('Scenario 2: Auth Redirect', () => {
    // Same as Scenario 1 — must be genuinely unauthenticated for the protected-route
    // redirect to fire (localStorage token would otherwise keep the session alive).
    test.use({ storageState: { cookies: [], origins: [] } });
    test.beforeEach(async ({ context }) => {
      await context.clearCookies();
    });

    test('should redirect unauthenticated user from dashboard to login', async ({ page }) => {
      await page.goto('/dashboard');

      // Should redirect to login page
      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show login form elements after redirect', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForURL(/\/login/, { timeout: 10000 });

      // Verify login form elements are visible
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await expect(emailInput).toBeVisible();

      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toBeVisible();
    });
  });

  // =========================================================================
  // Scenario 3: Insight Card Click (AC-003)
  // =========================================================================
  test.describe('Scenario 3: Insight Card Click', () => {
    test.skip(!process.env.E2E_AUTH_ENABLED, 'Authentication not enabled');

    test('should navigate when clicking an insight card or show empty state', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for AI Daily Insights section
      const insightsHeading = page.locator('h2:has-text("AI Daily Insights")');
      await expect(insightsHeading).toBeVisible({ timeout: 10000 });

      // Check if insights are loaded or empty state is shown
      const emptyState = page.locator('text="No insights at this time."');
      const insightLinks = page.locator('a[href*="insightId="]');

      if ((await insightLinks.count()) > 0) {
        // Click the first insight card
        const currentUrl = page.url();
        await insightLinks.first().click();

        // Verify navigation occurred (URL changed or contains insightId)
        await expect(page).not.toHaveURL(currentUrl);
      } else {
        // Verify empty state is displayed
        await expect(emptyState).toBeVisible();
      }
    });
  });

  // =========================================================================
  // Scenario 4: Quick Action Navigation (AC-004)
  // =========================================================================
  test.describe('Scenario 4: Quick Action Navigation', () => {
    test.skip(!process.env.E2E_AUTH_ENABLED, 'Authentication not enabled');

    test('should navigate when clicking a non-comingSoon quick action', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for Quick Actions section
      const quickActionsHeading = page.locator('h2:has-text("Quick Actions")');
      await expect(quickActionsHeading).toBeVisible({ timeout: 10000 });

      // Click "Send Email" quick action (non-comingSoon, href="/email")
      const sendEmailAction = page.locator('a:has-text("Send Email")');
      if ((await sendEmailAction.count()) > 0) {
        await sendEmailAction.click();
        await expect(page).toHaveURL(/\/email/);
      }
    });

    test('should show toast for comingSoon quick action without navigating', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for Quick Actions section
      const quickActionsHeading = page.locator('h2:has-text("Quick Actions")');
      await expect(quickActionsHeading).toBeVisible({ timeout: 10000 });

      const currentUrl = page.url();

      // Click "Log Call" (comingSoon action — rendered as button, not link)
      const logCallAction = page.locator('button:has-text("Log Call")');
      if ((await logCallAction.count()) > 0) {
        await logCallAction.click();

        // URL should NOT change (no navigation for comingSoon)
        await expect(page).toHaveURL(currentUrl);

        // Toast should appear with coming soon message
        const toast = page.locator('[role="status"], [data-sonner-toast]');
        if ((await toast.count()) > 0) {
          await expect(toast.first()).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  // =========================================================================
  // Scenario 5: Pinned Section & Edit Sheet (AC-005)
  // =========================================================================
  test.describe('Scenario 5: Pinned Section & Edit Sheet', () => {
    test.skip(!process.env.E2E_AUTH_ENABLED, 'Authentication not enabled');

    test('should display pinned section and open edit sheet', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for Pinned section heading
      const pinnedHeading = page.locator('h2:has-text("Pinned")');
      await expect(pinnedHeading).toBeVisible({ timeout: 10000 });

      // Click "Edit pinned navigation" button
      const editButton = page.locator('button[aria-label="Edit pinned navigation"]');
      await expect(editButton).toBeVisible();
      await editButton.click();

      // Verify sheet opens with correct title
      const sheetTitle = page.locator('text="Edit Pinned Navigation"');
      await expect(sheetTitle).toBeVisible({ timeout: 5000 });

      // Verify Save and Cancel buttons are visible
      const saveButton = page.locator('button:has-text("Save Changes")');
      await expect(saveButton).toBeVisible();

      const cancelButton = page.locator('button:has-text("Cancel")');
      await expect(cancelButton).toBeVisible();
    });
  });
});
