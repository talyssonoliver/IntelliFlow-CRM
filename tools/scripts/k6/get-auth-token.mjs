#!/usr/bin/env node
/**
 * Acquire a Supabase access token ONCE for k6 load tests and print it as an env
 * assignment. Reusing a persisted token across runs avoids the Supabase auth
 * rate-limit flakiness that #643 addresses, and makes runs reproducible.
 *
 * SECURITY: the token is a live credential. This script prints ONLY to stdout
 * and NEVER writes a committed file. Redirect the output into a gitignored env
 * file, then load it before running k6:
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *     node tools/scripts/k6/get-auth-token.mjs >> .env.k6.local
 *   set -a && . ./.env.k6.local && set +a       # export K6_AUTH_TOKEN
 *   k6 run --env K6_AUTH_TOKEN=$K6_AUTH_TOKEN ... tools/scripts/k6/authenticated-load-test.js
 *
 * Never commit the token, .env.k6.local, or any file containing K6_AUTH_TOKEN.
 *
 * Requires Node 22+ (global fetch, top-level await).
 */

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const email = process.env.K6_TEST_EMAIL || 'admin@intelliflow.dev';
const password = process.env.K6_TEST_PASSWORD || 'TestPassword123!';

if (!url || !anonKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set in the environment.');
  process.exit(1);
}

let res;
try {
  res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
} catch (err) {
  console.error(`ERROR: request to Supabase failed: ${err.message}`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`ERROR: authentication failed (HTTP ${res.status}).`);
  process.exit(1);
}

const body = await res.json();
if (!body.access_token) {
  console.error('ERROR: response contained no access_token.');
  process.exit(1);
}

// Env assignment on stdout ONLY. The value is a live credential — keep it out of git.
process.stdout.write(`K6_AUTH_TOKEN=${body.access_token}\n`);
