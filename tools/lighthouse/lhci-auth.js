// tools/lighthouse/lhci-auth.js
// Puppeteer auth script for LHCI authenticated home page audit
// Called by lighthouserc.authenticated.js -> collect.puppeteerScript
//
// PG-166: Injects Supabase auth cookies so Lighthouse audits the
// authenticated view of / instead of the public landing page.

/**
 * @param {import('puppeteer').Browser} browser
 * @param {{ url: string; options: Record<string, unknown> }} context
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();

  // 1. Obtain JWT from Supabase auth API
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local'
    );
  }

  const authResponse = await page.evaluate(
    async ({ supabaseUrl, anonKey }) => {
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({
          email: 'admin@intelliflow.dev',
          password: 'TestPassword123!',
        }),
      });
      return res.json();
    },
    { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }
  );

  const { access_token, user } = authResponse;
  if (!access_token) {
    throw new Error(`Auth failed: ${JSON.stringify(authResponse)}`);
  }

  // 2. Inject auth cookies
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  await browser.setCookie(
    { name: 'accessToken', value: access_token, domain: 'localhost', path: '/' },
    {
      name: 'session',
      value: JSON.stringify({ user, accessToken: access_token, expiresAt }),
      domain: 'localhost',
      path: '/',
    }
  );

  // 3. Navigate and verify authenticated state
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('h1', { timeout: 10000 });

  await page.close();
};
