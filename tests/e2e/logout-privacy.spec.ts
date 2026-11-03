/**
 * After logout, nothing personal may be on screen, whichever way the user moves.
 *
 * Needs a real login against a non-production stack:
 *   E2E_LOGOUT_EMAIL, E2E_LOGOUT_PASSWORD, and NEXT_PUBLIC_API_URL for the API checks.
 * Without those variables the logged-in tests skip, and say why.
 */
import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { acceptCookieConsent } from './utils/cookie-consent';

const EMAIL = process.env.E2E_LOGOUT_EMAIL;
const PASSWORD = process.env.E2E_LOGOUT_PASSWORD;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const PORTAL_TEXT = ['Welcome back,', 'new leads', 'View Schedule'];

let shot = 0;

async function capture(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  shot += 1;
  const name = `${String(shot).padStart(2, '0')}-${step}.png`;
  await page.screenshot({ path: testInfo.outputPath(name) });
}

/** Lets a late client-side swap happen before the page is judged. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
}

async function expectNothingPersonal(
  page: Page,
  testInfo: TestInfo,
  step: string,
  name: string,
  { cookieMayRemain = false } = {}
) {
  await settle(page);
  await capture(page, testInfo, step);
  const text = await page.locator('body').innerText();
  const html = await page.content();
  for (const phrase of PORTAL_TEXT) {
    expect.soft(text, `${step}: "${phrase}" on screen at ${page.url()}`).not.toContain(phrase);
  }
  expect.soft(html, `${step}: name in the page at ${page.url()}`).not.toContain(name);
  expect.soft(html, `${step}: email in the page at ${page.url()}`).not.toContain(EMAIL ?? '@@');

  if (!cookieMayRemain) {
    const cookies = await page.context().cookies();
    expect
      .soft(
        cookies.map((cookie) => cookie.name).filter((name) => name === 'accessToken'),
        `${step}: token cookie`
      )
      .toEqual([]);
  }
  const stored = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => /^(accessToken|refreshToken|sb-)/.test(key))
  );
  expect.soft(stored, `${step}: tokens in localStorage`).toEqual([]);
}

/** Logs in through the form and returns the first name the portal greets the user with. */
async function logIn(page: Page, testInfo: TestInfo): Promise<string> {
  await page.goto('/login');
  await acceptCookieConsent(page);
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', EMAIL ?? '');
  await page.fill('#password', PASSWORD ?? '');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === '/', { timeout: 30_000 });

  // A first-run dialog would cover the menu. Finishing onboarding is not under test.
  await page.evaluate(async (api) => {
    await fetch(`${api}/api/trpc/onboarding.complete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: '{}',
    });
  }, API_URL);
  await page.reload();

  const heading = page.getByRole('heading', { name: /Welcome back,/ });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await capture(page, testInfo, 'logged-in-home');
  const name = /Welcome back, (.+)!/.exec(await heading.innerText())?.[1];
  if (!name) throw new Error('The portal greeting has no name');
  return name;
}

/** Goes to sign-in as a person would. On a phone the link is inside the header menu. */
async function openSignIn(page: Page): Promise<void> {
  // The consent banner covers the phone menu when the browser has not kept the choice.
  const accept = page.getByTestId('accept-all-btn');
  if (await accept.isVisible()) await acceptCookieConsent(page);

  const link = page.locator('a[href="/login"]:visible').first();
  if (!(await link.isVisible())) {
    await page.locator('summary[aria-label="Menu"]').first().click();
  }
  await link.click();
}

async function signOut(page: Page): Promise<void> {
  await page.locator('button[aria-haspopup="true"]').last().click();
  await page.getByRole('button', { name: /Sign out/ }).click();
}

test.describe('logged out, with no session', () => {
  test('the API refuses the welcome summary', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/trpc/home.getWelcomeSummary`);
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain('userName');
  });

  test('root renders the landing page', async ({ page }, testInfo) => {
    await page.goto('/');
    await expectNothingPersonal(page, testInfo, 'no-session-root', '@@');
    await expect(page.locator('a[href="/login"]').first()).toBeAttached();
  });

  test('root renders the landing page for a cookie the API rejects', async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = [part({ alg: 'HS256' }), part({ sub: 'not-a-user', exp }), 'not-signed'];
    await context.addCookies([{ name: 'accessToken', value: cookie.join('.'), url: baseURL }]);

    await page.goto('/');
    // This test set the cookie itself. The landing page is what is being checked.
    await expectNothingPersonal(page, testInfo, 'rejected-cookie-root', '@@', {
      cookieMayRemain: true,
    });
    await expect(page.locator('a[href="/login"]').first()).toBeAttached();
  });
});

test.describe('after logging out', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_LOGOUT_EMAIL and E2E_LOGOUT_PASSWORD to run this');

  test('nothing personal at any step', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const name = await logIn(page, testInfo);

    // Soft navigation away and back, so the router holds the logged-in home.
    await page
      .getByRole('link', { name: /Dashboard/ })
      .first()
      .click();
    await page.waitForURL(/\/dashboard/);
    await page.goBack();
    await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();

    await signOut(page);
    await page.waitForURL((url) => !/Signing out/.test(url.href), { timeout: 15_000 });
    await page.waitForFunction(() => localStorage.getItem('accessToken') === null);
    await settle(page);
    expect.soft(new URL(page.url()).pathname, 'logout lands on root').toBe('/');
    await expectNothingPersonal(page, testInfo, 'after-logout', name);
    await expectFreshRootIsPublic(page, testInfo, 'fresh-root-after-sign-out', name);

    // The owner's path: on the sign-in page, tap the header logo.
    if (new URL(page.url()).pathname !== '/login') {
      await openSignIn(page);
      await page.waitForURL(/\/login/);
    }
    await expectNothingPersonal(page, testInfo, 'sign-in-page', name);
    await page.locator('a[href="/"]:visible').first().click();
    await page.waitForURL((url) => url.pathname === '/');
    await expectNothingPersonal(page, testInfo, 'logo-tap', name);

    for (const step of ['back-1', 'back-2', 'back-3']) {
      await page.goBack({ waitUntil: 'load' }).catch(() => null);
      await expectNothingPersonal(page, testInfo, step, name);
    }

    await page.reload();
    await expectNothingPersonal(page, testInfo, 'reload', name);

    await page.goto('/');
    await expectNothingPersonal(page, testInfo, 'root-again', name);
    await expect(page.getByRole('heading', { name: /Welcome back,/ })).toHaveCount(0);
  });

  test('the /logout page removes the session too', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const name = await logIn(page, testInfo);

    await page.goto('/logout');
    await page.waitForFunction(() => localStorage.getItem('accessToken') === null);
    await expectNothingPersonal(page, testInfo, 'logout-page', name);
    // The page keeps its own countdown: it must not react to its own broadcast.
    await expect(page.getByRole('heading', { name: 'Signed Out' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/logout');
    await expectFreshRootIsPublic(page, testInfo, 'fresh-root-after-logout-page', name);
  });

  test('another open tab leaves the portal too', async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    const name = await logIn(page, testInfo);
    const other = await openSecondTab(context);
    await expect(other.getByRole('heading', { name: /Welcome back,/ })).toBeVisible({
      timeout: 30_000,
    });

    await signOut(page);
    await page.waitForFunction(() => localStorage.getItem('accessToken') === null);
    await other.waitForTimeout(3000);
    await expectNothingPersonal(other, testInfo, 'other-tab', name);
  });
});

/** A new tab has no in-memory state, so it shows what the server gives this browser. */
async function expectFreshRootIsPublic(page: Page, testInfo: TestInfo, step: string, name: string) {
  const fresh = await page.context().newPage();
  await fresh.goto('/');
  await expectNothingPersonal(fresh, testInfo, step, name);
  await expect(fresh.locator('a[href="/login"]').first()).toBeAttached();
  await fresh.close();
}

async function openSecondTab(context: BrowserContext): Promise<Page> {
  const other = await context.newPage();
  await other.goto('/');
  return other;
}
