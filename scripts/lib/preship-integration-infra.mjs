/**
 * Is the database and Redis the integration suite will actually use reachable?
 *
 * The old precondition only asked Docker whether some running container's name
 * contained "postgres" and some contained "redis". Any project's containers
 * satisfied it. On 2026-10-05 a sibling project's `cao-postgres`/`cao-redis` did,
 * while IntelliFlow's own test containers (ports 5433/6380 per .env.test) were
 * down. The integration step then "passed" having skipped its infra-gated tests,
 * and infra-skip-gate failed the coverage step later, far from the cause.
 *
 * Now the probe resolves the endpoints the suite itself will use, the same way
 * vitest.config.ts does (vite loadEnv('test'): process env over .env.test.local
 * over .env.test over .env.local over .env), and opens a TCP connection to each.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Env files in increasing precedence, as vite's loadEnv('test') reads them. */
export const ENV_FILES = ['.env', '.env.local', '.env.test', '.env.test.local'];

/** Parse `KEY=value` lines (quotes stripped; comments and blanks ignored). */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split('\n')) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trimStart();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_]\w*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const q = value[0];
    if ((q === '"' || q === "'") && value.length > 1 && value.endsWith(q))
      value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** Merge env files (later wins), then the process env on top. */
export function resolveEnv(fileTexts, processEnv) {
  const merged = {};
  for (const text of fileTexts) Object.assign(merged, parseEnv(text));
  for (const [k, v] of Object.entries(processEnv)) if (v !== undefined) merged[k] = v;
  return merged;
}

/** host:port of a URL, with the scheme's default port; null when unusable. */
export function endpointOf(url, defaultPort) {
  try {
    const u = new URL(url);
    return { host: u.hostname || 'localhost', port: Number(u.port || defaultPort) };
  } catch {
    return null;
  }
}

/**
 * The endpoints the integration suite connects to. The suite's setup prefers
 * TEST_DATABASE_URL, then DATABASE_URL.
 * @returns {Array<{name: string, host: string, port: number}>}
 */
export function integrationEndpoints(env) {
  const db = env.TEST_DATABASE_URL || env.DATABASE_URL;
  const redis = env.REDIS_URL;
  const out = [];
  const pg = db && endpointOf(db, 5432);
  if (pg) out.push({ name: 'postgres', ...pg });
  const rd = redis && endpointOf(redis, 6379);
  if (rd) out.push({ name: 'redis', ...rd });
  return out;
}

/**
 * Why the integration step cannot run, or null when every endpoint answers.
 * @param {Array<{name: string, host: string, port: number}>} endpoints
 * @param {(host: string, port: number) => boolean} canConnect
 */
export function missingInfra(endpoints, canConnect) {
  const names = endpoints.map((e) => e.name);
  for (const required of ['postgres', 'redis']) {
    if (!names.includes(required)) return `no ${required} URL configured for the integration suite`;
  }
  const down = endpoints.filter((e) => !canConnect(e.host, e.port));
  return down.length === 0
    ? null
    : `not reachable: ${down.map((e) => `${e.name} at ${e.host}:${e.port}`).join(', ')}`;
}

/** Synchronous TCP probe (pre-ship's skip_if hooks are synchronous). */
export function tcpReachable(host, port, timeoutMs = 2000) {
  const probe =
    "const s=require('net').connect({host:process.argv[1],port:+process.argv[2]});" +
    's.setTimeout(+process.argv[3],()=>process.exit(1));' +
    "s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));";
  const r = spawnSync(process.execPath, ['-e', probe, host, String(port), String(timeoutMs)], {
    stdio: 'ignore',
    timeout: timeoutMs + 3000,
  });
  return r.status === 0;
}

/** The probe pre-ship runs, wired to the repo's env files and real sockets. */
export function integrationInfraMissing(
  repoRoot,
  processEnv = process.env,
  canConnect = tcpReachable
) {
  const texts = ENV_FILES.map((f) => {
    try {
      return fs.readFileSync(path.join(repoRoot, f), 'utf8');
    } catch {
      return '';
    }
  });
  return missingInfra(integrationEndpoints(resolveEnv(texts, processEnv)), canConnect);
}
