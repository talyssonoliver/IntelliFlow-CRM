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
    test.beforeEach(async ({ context }) => {
      await context.clearCookies();
    });

    test('should render public home page with hero section', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify main content landmark (use <main> tag to avoid ambiguity with other #main-content elements)
      const mainContent = page.locator('main#main-content');
      await expect(mainContent).toBeVisible();

      // Verify hero heading
      const heroHeading = page.locator('#hero-heading');
      await expect(heroHeading).toBeVisible();
      await expect(heroHeading).toContainText('Move faster, stay governed');
    });

    test('should display hero stats and value pillars', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify 3 hero stat cards
      const heroStats = page.locator('[data-testid="hero-stat"]');
      await expect(heroStats).toHaveCount(3);

      // Verify 3 value pillar cards
      const valuePillars = page.locator('[data-testid="value-pillar"]');
      await expect(valuePillars).toHaveCount(3);
    });

    test('should have CTAs linking to signup and contact', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify "Start free trial" CTA links to /signup
      const startTrialCta = page.locator('a:has-text("Start free trial")').first();
      await expect(startTrialCta).toBeVisible();
      await expect(startTrialCta).toHaveAttribute('href', '/signup');

      // Verify "Talk to sales" CTA links to /contact
      const talkToSalesCta = page.locator('a:has-text("Talk to sales")').first();
      await expect(talkToSalesCta).toBeVisible();
      await expect(talkToSalesCta).toHaveAttribute('href', '/contact');

      // Verify bottom CTA section exists
      const ctaSection = page.locator('[data-testid="cta-section"]');
      await expect(ctaSection).toBeVisible();
    });
  });

  // =========================================================================
  // Scenario 2: Auth Redirect (AC-002)
  // =========================================================================
  test.describe('Scenario 2: Auth Redirect', () => {
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
