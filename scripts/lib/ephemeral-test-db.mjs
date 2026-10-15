/**
 * Ephemeral, self-provisioning test database (#271).
 *
 * The documented test DB (`intelliflow-postgres-test`, localhost:5433) was a
 * hand-maintained persistent database: its schema drifted behind new migrations,
 * carried no `_prisma_migrations` history (P3005 on `migrate deploy`), and a fresh
 * container lacked the `extensions` schema the baseline migration needs.
 *
 * Instead of trusting that database, every run creates its OWN database on the
 * same server, bootstraps the extensions schema, applies every migration with
 * `prisma migrate deploy`, optionally seeds, runs the caller's command, and drops
 * the database again. The server is whatever the suite's env resolves to, so local
 * test containers (5433, or 25432-style remapped ports) and CI service containers
 * (different ports) work unchanged — nothing here hardcodes a port.
 *
 * This module is pure (no sockets, no child processes): the CLI in
 * scripts/test-db.mjs injects the real `connect` / `migrate` / `seed` functions,
 * and the unit tests inject fakes.
 */

import { hostOf } from '../../tools/scripts/lib/db-target.mjs';

/**
 * Hosts this tooling will CREATE/DROP databases on. Deliberately NARROWER than the
 * shared `isLocalUrl` guard, which also accepts any `*.internal` / `*.local` name:
 * a Railway private hostname (`*.railway.internal`) would pass that and then have
 * databases created, migrated and dropped on it. Loopback and the docker-compose
 * service names only.
 */
const PROVISION_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'host.docker.internal',
  'postgres',
  'postgres-test',
  'db',
]);

export function isProvisionableHost(url) {
  return PROVISION_HOSTS.has(hostOf(url));
}

/** Every database this tooling creates starts with this prefix. */
export const EPHEMERAL_PREFIX = 'intelliflow_test_run_';

/** Postgres identifiers are capped at 63 bytes. */
const MAX_IDENT = 63;

/** `down` refuses to drop anything that does not match this exactly. */
const EPHEMERAL_NAME = /^intelliflow_test_run_[a-z0-9_]{1,30}$/;

/** Expand `${VAR}` references (as dotenv-expand / Prisma do for `.env.test`). */
export function expandVars(value, env) {
  let out = String(value ?? '');
  // Bounded passes: handles `A=${B}` where `B=${C}` without looping on a cycle.
  for (let i = 0; i < 5 && out.includes('${'); i++) {
    out = out.replace(/\$\{([A-Za-z_]\w*)\}/g, (_, name) => env[name] ?? '');
  }
  return out;
}

/**
 * The server to provision on. Precedence: an explicit admin URL, then the suite's
 * own TEST_DATABASE_URL / DATABASE_TEST_URL / DATABASE_URL (same family the
 * integration setup and the pre-ship probe resolve). Returns '' when none is set.
 */
export function resolveServerUrl(env) {
  const raw =
    env.TEST_DATABASE_ADMIN_URL ||
    env.TEST_DATABASE_URL ||
    env.DATABASE_TEST_URL ||
    env.DATABASE_URL ||
    '';
  return expandVars(raw, env);
}

/**
 * Refuse anything that is not a local/CI-local server. Provisioning issues
 * CREATE/DROP DATABASE, so a production URL leaking in from `.env.local` must
 * fail loudly (stricter than the Prisma destructive-op guard: see PROVISION_HOSTS).
 */
export function assertLocalServer(serverUrl) {
  if (!serverUrl) {
    throw new Error(
      'No database server resolved. Set TEST_DATABASE_ADMIN_URL, TEST_DATABASE_URL or DATABASE_URL.'
    );
  }
  if (!isProvisionableHost(serverUrl)) {
    throw new Error(
      `Refusing to provision on non-local host "${hostOf(serverUrl) || '(unparseable URL)'}": ` +
        'ephemeral test databases are created and dropped, so only local/CI servers are allowed.'
    );
  }
}

/** A unique, valid, lowercase database name for this run. */
export function ephemeralName({ now = Date.now(), pid = process.pid, rand = Math.random() } = {}) {
  const stamp = Math.floor(now / 1000).toString(36);
  const salt = Math.floor(rand * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  const name = `${EPHEMERAL_PREFIX}${stamp}_${Number(pid).toString(36)}_${salt}`;
  return name.slice(0, MAX_IDENT);
}

export function isEphemeralName(name) {
  return typeof name === 'string' && EPHEMERAL_NAME.test(name);
}

/** Double-quote a SQL identifier. */
export function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

/** The server URL pointed at `dbName`, keeping credentials, port and query (`?schema=public`). */
export function urlForDatabase(serverUrl, dbName) {
  const u = new URL(serverUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Maintenance database used to issue CREATE/DROP DATABASE. */
export function adminUrlFor(serverUrl) {
  return urlForDatabase(serverUrl, 'postgres');
}

/**
 * The baseline migration GRANTs to the Supabase roles, which a plain pgvector
 * Postgres does not have (`P3018 role "anon" does not exist`). Roles are
 * cluster-wide, so this must be idempotent AND safe when two runs bootstrap at the
 * same time: the existence check is not atomic, hence the duplicate_object handler.
 * Mirrors the "Bootstrap Supabase schemas + roles" step in .github/workflows/ci.yml.
 */
export const SUPABASE_ROLES_SQL = `DO $$
DECLARE
  spec text[];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['anon', 'NOLOGIN'],
    ARRAY['authenticated', 'NOLOGIN'],
    ARRAY['service_role', 'NOLOGIN BYPASSRLS']
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = spec[1]) THEN
      BEGIN
        EXECUTE format('CREATE ROLE %I %s', spec[1], spec[2]);
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL; -- a concurrent run created it first
      END;
    END IF;
  END LOOP;
END
$$`;

/**
 * SQL run inside the NEW database before migrations. Only the `extensions` schema
 * is pre-created: the baseline migration itself installs uuid-ossp INTO it and
 * installs `vector` unqualified, i.e. into `public`, which is where the app's
 * `?schema=public` connections can see the type. Pre-installing `vector` into
 * `extensions` (as the dev init.sql does) makes the baseline's
 * `CREATE EXTENSION IF NOT EXISTS "vector"` a no-op and then fails with
 * `type "vector" does not exist`. `public` goes FIRST on the search_path, and the
 * database name is never hardcoded.
 */
export function bootstrapStatements(dbName) {
  return [
    SUPABASE_ROLES_SQL,
    'CREATE SCHEMA IF NOT EXISTS extensions',
    `ALTER DATABASE ${quoteIdent(dbName)} SET search_path TO public, extensions`,
    `ALTER DATABASE ${quoteIdent(dbName)} SET timezone TO 'UTC'`,
  ];
}

/**
 * Create, bootstrap and migrate a fresh database.
 *
 * @param {object} deps
 * @param {(url: string) => Promise<{query(sql: string): Promise<unknown>, end(): Promise<void>}>} deps.connect
 * @param {(url: string) => Promise<void> | void} deps.migrate  runs `prisma migrate deploy` against url
 * @param {(url: string) => Promise<void> | void} [deps.seed]   runs the seed against url
 * @param {string} deps.serverUrl
 * @param {string} [deps.name]
 * @returns {Promise<{name: string, url: string}>}
 */
export async function provision({ connect, migrate, seed, serverUrl, name = ephemeralName() }) {
  assertLocalServer(serverUrl);
  if (!isEphemeralName(name))
    throw new Error(`Refusing to create "${name}": not an ephemeral name.`);

  const url = urlForDatabase(serverUrl, name);

  const admin = await connect(adminUrlFor(serverUrl));
  try {
    await admin.query(`CREATE DATABASE ${quoteIdent(name)}`);
  } finally {
    await admin.end();
  }

  try {
    const db = await connect(url);
    try {
      for (const sql of bootstrapStatements(name)) await db.query(sql);
    } finally {
      await db.end();
    }
    await migrate(url);
    if (seed) await seed(url);
  } catch (error) {
    // A half-provisioned database must not outlive the failed run.
    await teardown({ connect, serverUrl, name }).catch(() => {});
    throw error;
  }

  return { name, url };
}

/** Drop an ephemeral database (idempotent). Refuses any non-ephemeral name. */
export async function teardown({ connect, serverUrl, name }) {
  assertLocalServer(serverUrl);
  if (!isEphemeralName(name)) {
    throw new Error(`Refusing to drop "${name}": only ${EPHEMERAL_PREFIX}* databases are managed.`);
  }
  const admin = await connect(adminUrlFor(serverUrl));
  try {
    // WITH (FORCE) evicts a lingering pool so a failed run cannot leak the database.
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

/** Epoch seconds encoded in an ephemeral name by ephemeralName(), or null. */
export function createdAtOf(name) {
  const m = /^intelliflow_test_run_([a-z0-9]+)_/.exec(name);
  if (!m) return null;
  const secs = parseInt(m[1], 36);
  return Number.isFinite(secs) ? secs * 1000 : null;
}

/**
 * Drop ephemeral databases older than `olderThanMs` (leaked by a killed `run`, or
 * left by `up`). Only names matching the ephemeral pattern are ever dropped, and a
 * database younger than the cut-off is left alone so a concurrent live run is safe.
 * @returns {Promise<string[]>} the names dropped
 */
export async function sweepStale({ connect, serverUrl, olderThanMs = 3_600_000, now = Date.now() }) {
  assertLocalServer(serverUrl);
  const admin = await connect(adminUrlFor(serverUrl));
  let names;
  try {
    const res = await admin.query(
      `SELECT datname FROM pg_database WHERE starts_with(datname, '${EPHEMERAL_PREFIX}')`
    );
    names = (res?.rows ?? []).map((r) => r.datname);
  } finally {
    await admin.end();
  }
  const stale = names.filter((n) => {
    const at = isEphemeralName(n) ? createdAtOf(n) : null;
    return at !== null && now - at >= olderThanMs;
  });
  for (const name of stale) await teardown({ connect, serverUrl, name });
  return stale;
}

/**
 * Environment for a child process that should use the ephemeral database. Every
 * variable the suite family reads is pointed at it, so a stale `.env.test` value
 * cannot win.
 */
export function childEnv(baseEnv, url) {
  return {
    ...baseEnv,
    DATABASE_URL: url,
    DIRECT_URL: url,
    TEST_DATABASE_URL: url,
    DATABASE_TEST_URL: url,
  };
}
