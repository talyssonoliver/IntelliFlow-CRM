/**
 * Shared DB-target resolution for the destructive-op guards.
 *
 * Mirrors how prisma.config.ts picks the datasource:
 *   url = DIRECT_URL ?? DATABASE_URL   (after dotenv loads .env)
 * so the guards block ONLY when the *actual* target is the wrong environment —
 * not the commands themselves. No package deps (self-contained, runs anywhere).
 */
import { readFileSync, existsSync } from 'node:fs';

/** Minimal .env parser (indexOf-based — no regex backtracking). */
export function parseEnvFile(path) {
  const out = {};
  if (!path || !existsSync(path)) return out;
  try {
    for (let line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('export ')) line = line.slice(7).trim();
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      const q = val[0];
      if ((q === '"' || q === "'") && val[val.length - 1] === q) val = val.slice(1, -1);
      out[key] = val;
    }
  } catch {
    /* unreadable .env — treat as empty */
  }
  return out;
}

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'host.docker.internal',
  'postgres',
  'postgres-test',
  'db',
]);

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** local/CI-local (docker compose service names + the CI postgres service). */
export function isLocalUrl(url) {
  const host = hostOf(url);
  if (!host) return false;
  return LOCAL_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal');
}

/**
 * Resolve the effective datasource URL given inline overrides + .env files.
 * @param {{ inline?: Record<string,string|undefined>, envPaths?: string[] }} opts
 * @returns {{ url: string, source: 'inline'|'env'|'none' }}
 */
export function resolveDbUrl({ inline = {}, envPaths = [] } = {}) {
  const envMerged = {};
  // Later files do NOT override earlier ones (first env file wins, like prisma's
  // single CWD .env — we pass them most-specific-first).
  for (const p of envPaths) {
    const parsed = parseEnvFile(p);
    for (const k of Object.keys(parsed)) if (!(k in envMerged)) envMerged[k] = parsed[k];
  }
  const pick = (name) => inline[name] ?? envMerged[name];
  const direct = pick('DIRECT_URL');
  const database = pick('DATABASE_URL');
  const url = direct ?? database ?? '';
  const source = direct !== undefined || database !== undefined ? (inline.DIRECT_URL ?? inline.DATABASE_URL ? 'inline' : 'env') : 'none';
  return { url, source };
}
