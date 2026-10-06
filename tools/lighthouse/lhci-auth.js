// tools/lighthouse/lhci-auth.js
// Puppeteer auth script for LHCI authenticated home page audit
// Called by lighthouserc.authenticated.js -> collect.puppeteerScript
//
// PG-166: Authenticates via Supabase REST API and injects tokens into
// localStorage + cookie so the AuthContext recognises the session.
//
// The script sets up auth state and exits. LHCI then navigates to the URL
// for auditing — Lighthouse will see the localStorage/cookie tokens because
// it runs in the same browser process.

/**
 * @param {import('puppeteer').Browser} browser
 * @param {{ url: string; options: Record<string, unknown> }} context
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const TEST_EMAIL = process.env.LHCI_TEST_EMAIL;
  const TEST_PASSWORD = process.env.LHCI_TEST_PASSWORD;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, LHCI_TEST_EMAIL and LHCI_TEST_PASSWORD must be set'
    );
  }

  // 1. Navigate to the target origin so localStorage is scoped correctly
  await page.goto(context.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 2. Authenticate via Supabase REST API (runs in browser context)
  const authResponse = await page.evaluate(
    async (opts) => {
      const res = await fetch(`${opts.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: opts.anonKey },
        body: JSON.stringify({
          email: opts.email,
          password: opts.password,
        }),
      });
      return res.json();
    },
    {
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }
  );

  const { access_token, refresh_token } = authResponse;
  if (!access_token) {
    throw new Error(`Auth failed: ${JSON.stringify(authResponse)}`);
  }

  // 3. Store tokens in localStorage + cookie
  //    Mirrors: storeSessionTokens() in token-exchange.ts
  //    Mirrors: syncTokenToCookie() in session-cleanup.ts
  await page.evaluate(
    (opts) => {
      localStorage.setItem('accessToken', opts.accessToken);
      if (opts.refreshToken) {
        localStorage.setItem('refreshToken', opts.refreshToken);
      }
      document.cookie = `accessToken=${opts.accessToken}; path=/; max-age=3600; samesite=lax`;
    },
    { accessToken: access_token, refreshToken: refresh_token }
  );

  // Done — LHCI handles navigation from here.
  // localStorage and cookie persist in the browser for subsequent page loads.
  await page.close();
};
