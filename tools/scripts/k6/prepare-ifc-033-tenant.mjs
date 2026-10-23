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
 * Sign up, falling back to login when the account already exists. Returns an access token.
 * @param {FetchLike} [fetchImpl]
 */
export async function acquireToken(baseUrl, email, password, fetchImpl = fetch) {
  try {
    const signup = await call(
      baseUrl,
      'auth.signup',
      { email, password, confirmPassword: password, name: 'IFC-033 Load Test', acceptTerms: true },
      undefined,
      fetchImpl
    );
    if (signup?.session?.accessToken) return signup.session.accessToken;
    if (signup?.needsEmailVerification) {
      throw new Error('auth.signup needs email verification; confirm the inbox, then re-run');
    }
  } catch (err) {
    if (/verification/.test(String(err.message))) throw err;
    // Account exists (or signup refused): try a normal login with the same credentials.
  }
  const login = await call(baseUrl, 'auth.login', { email, password }, undefined, fetchImpl);
  const token = login?.session?.accessToken;
  if (!token) throw new Error('auth.login returned no access token');
  return token;
}

/**
 * @param {{ baseUrl: string; email: string; password: string; poolSize: number; runTag: string }} opts
 * @param {FetchLike} [fetchImpl]
 */
export async function prepareTenant(
  { baseUrl, email, password, poolSize, runTag },
  fetchImpl = fetch
) {
  const token = await acquireToken(baseUrl, email, password, fetchImpl);
  const [seedInput, ...poolInputs] = buildLeadInputs(poolSize + 1, runTag);
  const seed = await call(baseUrl, 'lead.create', seedInput, token, fetchImpl);
  const poolIds = [];
  for (const input of poolInputs) {
    const lead = await call(baseUrl, 'lead.create', input, token, fetchImpl);
    poolIds.push(lead.id);
  }
  for (const ids of chunk(poolIds)) {
    await call(baseUrl, 'lead.bulkUpdateStatus', { ids, status: 'QUALIFIED' }, token, fetchImpl);
  }
  return { token, seedLeadId: seed.id, poolIds };
}

function upsertEnvFile(path, values) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const kept = lines.filter((l) => !Object.keys(values).some((k) => l.startsWith(`${k}=`)));
  const added = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  writeFileSync(path, `${[...kept, ...added].join('\n')}\n`, { mode: 0o600 });
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../..');
  const envFile = resolve(repoRoot, '.env.k6.local');
  const baseUrl = process.env.BASE_URL;
  const email = process.env.K6_TEST_EMAIL;
  if (!baseUrl || !email) {
    console.error('ERROR: BASE_URL and K6_TEST_EMAIL must be set.');
    process.exit(1);
  }
  const password = process.env.K6_TEST_PASSWORD || generatePassword();
  const poolSize = Number(process.env.POOL_SIZE || 20);
  const runTag = process.env.RUN_TAG || new Date().toISOString().slice(0, 10);

  // Persist credentials before any network call so a retry reuses the same account.
  upsertEnvFile(envFile, { K6_TEST_EMAIL: email, K6_TEST_PASSWORD: password });
  const { token, seedLeadId, poolIds } = await prepareTenant({
    baseUrl,
    email,
    password,
    poolSize,
    runTag,
  });
  upsertEnvFile(envFile, { K6_AUTH_TOKEN: token, SEED_LEAD_ID: seedLeadId });

  const dataDir = resolve(here, '.data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(resolve(dataDir, 'qualified-leads.json'), JSON.stringify(poolIds, null, 2));
  console.log(
    `[prepare] tenant ready on ${baseUrl}: seed lead ${seedLeadId}, ${poolIds.length} QUALIFIED`
  );
  console.log('[prepare] K6_AUTH_TOKEN and SEED_LEAD_ID written to .env.k6.local (gitignored)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[prepare] ${err.message}`);
    process.exit(1);
  });
}
