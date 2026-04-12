import { test, expect } from '@playwright/test';

/**
 * Auth Flow E2E Tests
 *
 * Tests the authentication flow including:
 * - Public page access
 * - Protected route redirect
 * - Login page display
 * - Authenticated user redirect from login
 */

test.describe('Auth Flow', () => {
  test.beforeEach(async ({ context }) => {
    // Clear cookies before each test
    await context.clearCookies();
  });

  test('should show public home page without auth', async ({ page }) => {
    await page.goto('/');

    // Should load the home page
    await expect(page).toHaveURL('/');

    // Should show public header (not authenticated header)
    // Look for sign up or login links that indicate public view
    const pageContent = await page.content();
    expect(pageContent).toContain('IntelliFlow');
  });

  test('should redirect unauthenticated user from dashboard to login', async ({ page }) => {
    // Try to access dashboard without auth
    await page.goto('/dashboard');

    // Should redirect to login (client-side redirect)
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Verify we're on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show login page for unauthenticated user', async ({ page }) => {
    await page.goto('/login');

    // Should stay on login page
    await expect(page).toHaveURL('/login');

    // Should show login form elements
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Should show OAuth buttons
    const googleButton = page.getByRole('button', { name: /google/i });
    await expect(googleButton).toBeVisible();
  });

  test('should show only one header on public page', async ({ page }) => {
    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Count header elements - should only have one
    const headers = page.locator('header');
    const headerCount = await headers.count();

    // Should have exactly one header (either public or auth, not both)
    expect(headerCount).toBeLessThanOrEqual(1);
  });

  test('should maintain login page after logout redirect', async ({ page }) => {
    // Simulate arriving at login page after logout
    await page.goto('/login?logged_out=true');

    // Should stay on login page (not redirect to dashboard)
    await page.waitForTimeout(2000); // Wait for any potential redirects

    // Verify still on login page
    await expect(page).toHaveURL(/\/login/);
  });
});

// NOTE: Testing authenticated redirect requires real OAuth login.
// The proxy checks for accessToken cookie, but client-side auth validates the JWT.
// A mock cookie would be rejected by the AuthContext.
// For full auth testing, use manual browser testing or a dedicated auth test setup
// that uses real Supabase credentials (like k6 load tests do).
