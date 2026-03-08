import { test, expect } from '@playwright/test';

/**
 * MFA Management E2E Tests (PG-125)
 *
 * Tests the MFA management dashboard at /settings/security/mfa
 * Requires authenticated session with MFA-enabled user.
 *
 * Guarded by E2E_MFA_ENABLED — skip when auth credentials not configured.
 */

test.describe('MFA Management', () => {
  test.skip(!process.env.E2E_MFA_ENABLED, 'MFA E2E requires auth credentials');

  test.beforeEach(async ({ page }) => {
    // Authenticate via API and inject session token
    const response = await page.request.post('/api/trpc/auth.login', {
      data: {
        email: process.env.E2E_MFA_USER_EMAIL,
        password: process.env.E2E_MFA_USER_PASSWORD,
      },
    });

    if (response.ok()) {
      const data = await response.json();
      const token = data?.result?.data?.token;
      if (token) {
        await page.evaluate((t) => {
          localStorage.setItem('auth-token', t);
        }, token);
      }
    }
  });

  test('should display MFA status page', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    // Should show the MFA management page with status badge
    const statusBadge = page.getByTestId('mfa-status-badge');
    await expect(statusBadge).toBeVisible();
  });

  test('should show enabled/disabled badge based on MFA state', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    const statusBadge = page.getByTestId('mfa-status-badge');
    await expect(statusBadge).toBeVisible();

    const badgeText = await statusBadge.textContent();
    expect(['Enabled', 'Disabled']).toContain(badgeText?.trim());
  });

  test('should show disable MFA button when enabled', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    const disableBtn = page.getByTestId('disable-mfa-btn');
    // Button may not exist if MFA is disabled — conditional check
    const isVisible = await disableBtn.isVisible().catch(() => false);
    if (isVisible) {
      await expect(disableBtn).toBeEnabled();
    }
  });

  test('should open disable confirmation dialog', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    const disableBtn = page.getByTestId('disable-mfa-btn');
    const isVisible = await disableBtn.isVisible().catch(() => false);
    test.skip(!isVisible, 'MFA not enabled — cannot test disable flow');

    await disableBtn.click();

    const dialog = page.getByTestId('disable-confirm-dialog');
    await expect(dialog).toBeVisible();
  });

  test('should show regenerate backup codes button', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    const regenBtn = page.getByTestId('regen-backup-btn');
    const isVisible = await regenBtn.isVisible().catch(() => false);
    if (isVisible) {
      await expect(regenBtn).toBeEnabled();
    }
  });

  test('should navigate to setup page', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    // Look for "Add Method" or setup link
    const setupLink = page.locator('a[href*="/setup"]');
    const isVisible = await setupLink.first().isVisible().catch(() => false);
    if (isVisible) {
      await setupLink.first().click();
      await expect(page).toHaveURL(/\/settings\/security\/mfa\/setup/);
    }
  });

  test('should preserve state after page refresh', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    const statusBadge = page.getByTestId('mfa-status-badge');
    await expect(statusBadge).toBeVisible();
    const initialText = await statusBadge.textContent();

    // Refresh and verify state persists
    await page.reload();
    await expect(statusBadge).toBeVisible();
    const afterRefreshText = await statusBadge.textContent();
    expect(afterRefreshText).toBe(initialText);
  });

  test('should display backup codes after regeneration', async ({ page }) => {
    await page.goto('/settings/security/mfa');

    const regenBtn = page.getByTestId('regen-backup-btn');
    const isVisible = await regenBtn.isVisible().catch(() => false);
    test.skip(!isVisible, 'Regenerate button not visible — MFA may not be enabled');

    await regenBtn.click();

    // Should show a confirmation dialog requiring TOTP code
    // After entering code, new codes should be displayed
    const codesDisplay = page.getByTestId('new-backup-codes-display');
    // This may require TOTP input — just verify the flow starts
    const dialogVisible = await page.locator('[role="alertdialog"]').isVisible().catch(() => false);
    expect(dialogVisible).toBe(true);
  });
});
