#!/usr/bin/env node
/**
 * IFC-033 deployed-environment prep: a dedicated load-test tenant on a DEPLOYED API.
 *
 * Owner ruling (.specify/sprints/sprint-18/context/IFC-033/IFC-033-owner-ruling.md):
 * the k6 run targets the deployed API inside its OWN tenant, all writes go through
 * the API (never the DB), and synthetic data is tagged and left in place.
 *
 * Steps, all over plain tRPC (no browser):
 *   1. auth.signup (or auth.login when the account already exists) -> access token.
 *      The API provisions the tenant on the first authenticated call.
 *   2. lead.create one seed lead (getById read target) + POOL_SIZE pool leads.
 *   3. lead.bulkUpdateStatus pool -> QUALIFIED (the conversion path's precondition).
 *   4. Write tools/scripts/k6/.data/qualified-leads.json (gitignored) and print
 *      SEED_LEAD_ID. The token, email and password go ONLY to .env.k6.local
 *      (gitignored by `.env*.local`), never to stdout or a tracked file.
 *
 * Env: BASE_URL (required), K6_TEST_EMAIL (required), K6_TEST_PASSWORD (generated
 * and persisted to .env.k6.local when unset), POOL_SIZE (default 20), RUN_TAG.
 *
 * Requires Node 22+ (global fetch, top-level await).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BULK_STATUS_MAX_IDS = 100;

/**
 * The slice of `fetch` this script uses, so tests can pass a fake without a cast.
 * @typedef {(url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
 *   Promise<{ status: number; json: () => Promise<any> }>} FetchLike
 */

export function trpcUrl(baseUrl, proc) {
  let base = baseUrl;
  while (base.endsWith('/')) base = base.slice(0, -1);
  return `${base}/api/trpc/${proc}`;
}

/**
 * Headers for a tRPC call. A Bearer token also satisfies the API's anti-CSRF check.
 * @param {string} [token]
 * @returns {Record<string, string>}
 */
export function trpcHeaders(token) {
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json', 'x-csrf-token': 'k6-load-test' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Unwrap a tRPC (no transformer) response body, or throw with the server's message. */
export function unwrapTrpc(proc, status, body) {
  if (status >= 200 && status < 300 && body && body.result) return body.result.data;
  const message = body?.error?.message ?? body?.error?.json?.message ?? `HTTP ${status}`;
  throw new Error(`${proc} failed (HTTP ${status}): ${message}`);
}

/** Synthetic, clearly tagged lead inputs (reserved example.com domain, never deliverable). */
export function buildLeadInputs(count, runTag) {
  return Array.from({ length: count }, (_, i) => ({
    email: `k6-pool-${runTag}-${i}@loadtest.example.com`,
    firstName: 'K6',
    lastName: `Pool${i}`,
    company: 'LoadTest Co',
    source: 'WEBSITE',
    estimatedValue: 25000,
    tags: ['ifc-033-load-test', runTag],
  }));
}

/** Split ids into chunks bulkUpdateStatus accepts (1..100 ids each). */
export function chunk(ids, size = BULK_STATUS_MAX_IDS) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export function generatePassword() {
  // Upper, lower, digit and symbol guaranteed, for the API's strong-password rule.
  return `K6a!${randomBytes(18).toString('base64url')}9`;
}

/** @param {FetchLike} [fetchImpl] */
async function call(baseUrl, proc, input, token, fetchImpl = fetch) {
  const res = await fetchImpl(trpcUrl(baseUrl, proc), {
    method: 'POST',
    headers: trpcHeaders(token),
    body: JSON.stringify(input),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return unwrapTrpc(proc, res.status, body);
}

/**
 * Sign up, falling back to login when the account already exists.
 * Resolves to the access token and its expiry (Supabase access tokens are short-lived).
 * @param {FetchLike} [fetchImpl]
 */
export async function acquireToken(baseUrl, email, password, fetchImpl = fetch) {
  let signup = null;
  let signupError = null;
  try {
    signup = await call(
      baseUrl,
      'auth.signup',
      { email, password, confirmPassword: password, name: 'IFC-033 Load Test', acceptTerms: true },
      undefined,
      fetchImpl
    );
  } catch (err) {
    signupError = err; // Usually "account exists": fall back to a normal login below.
  }
  if (signup?.session?.accessToken) {
    return { token: signup.session.accessToken, expiresAt: signup.session.expiresAt ?? null };
  }
  if (signup?.needsEmailVerification) {
    throw new Error('auth.signup needs email verification; confirm the inbox, then re-run');
  }
  let login;
  try {
    login = await call(baseUrl, 'auth.login', { email, password }, undefined, fetchImpl);
  } catch (err) {
    const context = signupError ? ` (signup also failed: ${signupError.message})` : '';
    throw new Error(`${err.message}${context}`, { cause: err });
  }
  const token = login?.session?.accessToken;
  if (!token) throw new Error('auth.login returned no access token');
  return { token, expiresAt: login.session.expiresAt ?? null };
}

/**
 * @param {{ baseUrl: string; email: string; password: string; poolSize: number; runTag: string }} opts
 * @param {FetchLike} [fetchImpl]
 */
export async function prepareTenant(
  { baseUrl, email, password, poolSize, runTag },
  fetchImpl = fetch
) {
  const { token, expiresAt } = await acquireToken(baseUrl, email, password, fetchImpl);
  const [seedInput, ...poolInputs] = buildLeadInputs(poolSize + 1, runTag);
  const seed = await call(baseUrl, 'lead.create', seedInput, token, fetchImpl);
  const createdIds = [];
  for (const input of poolInputs) {
    const lead = await call(baseUrl, 'lead.create', input, token, fetchImpl);
    createdIds.push(lead.id);
  }
  // bulkUpdateStatus answers 200 even when ids fail; trust only `successful`, so the
  // k6 conversion scenario never receives a lead that is still NEW.
  const poolIds = [];
  for (const ids of chunk(createdIds)) {
    const res = await call(
      baseUrl,
      'lead.bulkUpdateStatus',
      { ids, status: 'QUALIFIED' },
      token,
      fetchImpl
    );
    if (res?.failed?.length) {
      throw new Error(
        `lead.bulkUpdateStatus left ${res.failed.length} lead(s) unqualified: ${res.failed[0].error}`
      );
    }
    poolIds.push(...(res?.successful ?? []));
  }
  return { token, expiresAt, seedLeadId: seed.id, poolIds };
}

/** Unique per run: lead emails are unique per tenant, so a re-run must not reuse a tag. */
export function defaultRunTag(now = Date.now()) {
  return `run-${now.toString(36)}`;
}

/**
 * Drop CR/LF and other control characters from a value before it reaches a log line or the env
 * file. Server-supplied values (ids, expiry, error messages) could otherwise forge extra lines.
 */
export function stripControlChars(value) {
  return Array.from(String(value))
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
}

/** Set KEY=value lines in a dotenv-style file, keeping every other line. */
export function upsertEnvFile(path, values) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const kept = lines.filter((l) => !Object.keys(values).some((k) => l.startsWith(`${k}=`)));
  const added = Object.entries(values).map(([k, v]) => `${k}=${stripControlChars(v)}`);
  writeFileSync(path, `${[...kept, ...added].join('\n')}\n`, { mode: 0o600 });
}

/**
 * @param {{ env?: Record<string, string | undefined>; repoRoot: string; fetchImpl?: FetchLike;
 *   log?: (line: string) => void }} deps
 */
export async function main({ env = process.env, repoRoot, fetchImpl = fetch, log = console.log }) {
  const baseUrl = env.BASE_URL;
  const email = env.K6_TEST_EMAIL;
  if (!baseUrl || !email) throw new Error('BASE_URL and K6_TEST_EMAIL must be set.');
  const envFile = resolve(repoRoot, '.env.k6.local');
  const password = env.K6_TEST_PASSWORD || generatePassword();
  const poolSize = Number(env.POOL_SIZE || 20);
  const runTag = env.RUN_TAG || defaultRunTag();

  // Persist credentials before any network call so a retry reuses the same account.
  upsertEnvFile(envFile, { K6_TEST_EMAIL: email, K6_TEST_PASSWORD: password });
  const { token, expiresAt, seedLeadId, poolIds } = await prepareTenant(
    { baseUrl, email, password, poolSize, runTag },
    fetchImpl
  );
  upsertEnvFile(envFile, { K6_AUTH_TOKEN: token, SEED_LEAD_ID: seedLeadId });

  const dataDir = resolve(repoRoot, 'tools/scripts/k6/.data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(resolve(dataDir, 'qualified-leads.json'), JSON.stringify(poolIds, null, 2));
  const safe = stripControlChars;
  log(
    `[prepare] tenant ready on ${safe(baseUrl)}: seed lead ${safe(seedLeadId)}, ` +
      `${poolIds.length} QUALIFIED`
  );
  log(
    `[prepare] K6_AUTH_TOKEN and SEED_LEAD_ID written to .env.k6.local (gitignored); ` +
      `token expires ${expiresAt == null ? 'at an unknown time' : safe(expiresAt)}, ` +
      `keep DURATION inside that`
  );
  return { seedLeadId, poolSize: poolIds.length, runTag };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  main({ repoRoot }).catch((err) => {
    console.error(`[prepare] ${stripControlChars(err.message)}`);
    process.exit(1);
  });
}
