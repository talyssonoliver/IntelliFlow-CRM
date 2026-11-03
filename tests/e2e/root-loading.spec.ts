/**
 * While `/` loads, someone with no session must not see the shape of the portal.
 * The navigation is held open so the loading state stays on screen long enough to check.
 */
import { test, expect, type Page } from '@playwright/test';
import { acceptCookieConsent } from './utils/cookie-consent';

const PORTAL_SKELETON = '.animate-pulse .bg-gradient-to-r';
const NEUTRAL_SPLASH = '[data-testid="neutral-loading"]';

/** Holds the server's answer for `/`, so the loading state stays up until released. */
async function holdRootNavigation(page: Page): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === '/',
    async (route) => {
      await held;
      await route.continue();
    }
  );
  return release;
}

test.describe('the root loading state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await acceptCookieConsent(page);
    await page.waitForLoadState('networkidle');
  });

  test('shows no portal shape to someone with no session', async ({ page }, testInfo) => {
    const release = await holdRootNavigation(page);

    await page.locator('a[href="/"]:visible').first().click();
    await expect(page.locator(`${NEUTRAL_SPLASH}, ${PORTAL_SKELETON}`).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('loading-no-session.png') });

    await expect(page.locator(PORTAL_SKELETON)).toHaveCount(0);
    await expect(page.locator(NEUTRAL_SPLASH)).toBeVisible();

    release();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.locator('a[href="/signup"]:visible').first()).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: testInfo.outputPath('landing-after-loading.png') });
  });

  test('keeps the portal shape for someone with a session', async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = [part({ alg: 'HS256' }), part({ sub: 'loading-test', exp }), 'not-signed'];
    await context.addCookies([{ name: 'accessToken', value: cookie.join('.'), url: baseURL }]);
    const release = await holdRootNavigation(page);

    await page.locator('a[href="/"]:visible').first().click();
    await expect(page.locator(PORTAL_SKELETON).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('loading-with-session.png') });
    release();
  });
});
