#!/usr/bin/env node
/**
 * Daily IntelliFlow production database backup (owner request 2026-11-12;
 * the pattern of nutri-gyn/scripts/backup-nutrigyn.mjs).
 *
 * One run, end to end:
 *   1. Fails at once, with a log line, when Docker is not running.
 *   2. pg_dump of the public, auth and storage schemas, custom format
 *      (compressed), from a one-shot `docker run --rm` of the Supabase Postgres
 *      image that matches production (17.6). No long-lived container.
 *      The session is read-only (default_transaction_read_only=on).
 *   3. Leaves out only the ROWS of tables that are telemetry or ephemeral
 *      (EXCLUDED_DATA below; the owner's list of 2026-11-12). Their schema is
 *      kept, and so is every customer, audit, billing and AI-insight table.
 *   4. Verifies the file opens (`pg_restore --list`) and lists table data for
 *      the core tables, then renames it from .partial to .dump.
 *   5. Deletes dumps older than the retention (default 14 days), judged by the
 *      date in the file name.
 *   6. Appends ONE JSONL line per run to <root>/logs/backup-intelliflow.jsonl,
 *      SUCCESS or FAILURE with the reason. Never a silent skip.
 *
 * Credentials, in this order: process env INTELLIFLOW_BACKUP_DATABASE_URL;
 * then C:\Users\talys\ops\intelliflow\backup.env (same key); then the main
 * checkout's .env.local (DIRECT_URL, else DATABASE_URL). The URL is split into
 * libpq variables (PGHOST, PGUSER, ...) handed to the container by name, so it
 * never appears on a command line, in a log or on screen.
 *
 * Network: Supabase's direct host is IPv6-only and Docker Desktop has no IPv6
 * route, so for the run the script opens a TCP relay on 127.0.0.1 (random
 * port) to the database; the container reaches it as host.docker.internal.
 * TLS stays end to end (the relay only copies bytes). It closes with the run.
 *
 * Not covered: Storage files (only their metadata rows are in the dump) and
 * database roles. Said here so nobody assumes otherwise.
 *
 * Usage:
 *   node tools/scripts/backup-intelliflow-db.mjs [--root <dir>] [--retention-days <n>]
 */
import { spawn as spawnChild, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.106';
export const SCHEMAS = ['public', 'auth', 'storage'];
/** Telemetry and ephemeral tables: schema kept, rows left out (owner, 2026-11-12). */
export const EXCLUDED_DATA = [
  'public.ai_monitoring_events',
  'public.performance_metrics',
  'public.sessions',
  'public.email_oauth_states',
  'public.partner_login_grants',
  'auth.refresh_tokens',
  'auth.sessions',
  'auth.flow_state',
  'auth.one_time_tokens',
  'auth.mfa_amr_claims',
  'auth.saml_relay_states',
  'auth.oauth_client_states',
  'auth.oauth_authorizations',
];
/** A dump is only accepted when its table of contents holds data for these. */
export const REQUIRED_DATA = ['public.tenants', 'public.users', 'public.leads', 'auth.users'];

const DEFAULT_ROOT = 'C:\\Users\\talys\\intelliflow-backups';
const DEFAULT_RETENTION_DAYS = 14;
const OPS_ENV_FILE = 'C:\\Users\\talys\\ops\\intelliflow\\backup.env';
const MAIN_ENV_LOCAL = 'C:\\Users\\talys\\projects\\intelliFlow-CRM\\.env.local';
const KEY = 'INTELLIFLOW_BACKUP_DATABASE_URL';

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

/** The database URL and where it came from (never the URL in any message). */
export function resolveDatabaseUrl(
  env = process.env,
  files = { ops: OPS_ENV_FILE, envLocal: MAIN_ENV_LOCAL }
) {
  if (env[KEY]) return { url: env[KEY], source: `env ${KEY}` };
  const ops = parseEnvFile(files.ops);
  if (ops[KEY]) return { url: ops[KEY], source: 'ops backup.env' };
  const local = parseEnvFile(files.envLocal);
  if (local.DIRECT_URL) return { url: local.DIRECT_URL, source: '.env.local DIRECT_URL' };
  if (local.DATABASE_URL) return { url: local.DATABASE_URL, source: '.env.local DATABASE_URL' };
  return { url: undefined, source: 'none' };
}

/** libpq variables for the container. Read-only session; SSL required off localhost. */
export function libpqEnv(url) {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol))
    throw new Error('the database URL is not a postgres URL');
  const local = ['localhost', '127.0.0.1', 'host.docker.internal'].includes(u.hostname);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    PGSSLMODE: u.searchParams.get('sslmode') || (local ? 'disable' : 'require'),
    PGOPTIONS: '-c default_transaction_read_only=on',
  };
}

export function parseArgs(argv) {
  const at = (flag) => argv.indexOf(flag);
  return {
    root: at('--root') !== -1 ? path.resolve(argv[at('--root') + 1]) : DEFAULT_ROOT,
    retentionDays:
      at('--retention-days') !== -1
        ? Number(argv[at('--retention-days') + 1])
        : DEFAULT_RETENTION_DAYS,
  };
}

export const dumpName = (d) => `intelliflow-${d.toISOString().slice(0, 10)}.dump`;

/** pg_dump arguments inside the container: no credentials, the PG* env carries them. */
export function pgDumpArgs(fileInContainer) {
  return [
    '--format=custom',
    '--compress=6',
    '--no-owner',
    ...SCHEMAS.map((s) => `--schema=${s}`),
    ...EXCLUDED_DATA.map((t) => `--exclude-table-data=${t}`),
    `--file=${fileInContainer}`,
  ];
}

/** Table names whose data is in the dump, from `pg_restore --list` output. */
export function tablesWithData(tocText) {
  const out = new Set();
  for (const line of tocText.split(/\r?\n/)) {
    const m = line.match(/TABLE DATA (\S+) (\S+) /);
    if (m) out.add(`${m[1]}.${m[2]}`);
  }
  return out;
}

/** Dump files older than the retention, by the date in their names. */
export function expiredDumps(files, now, retentionDays) {
  const cutoff = new Date(now.getTime() - retentionDays * 86400000).toISOString().slice(0, 10);
  return files.filter((f) => {
    const m = f.match(/^intelliflow-(\d{4}-\d{2}-\d{2})\.dump(\.partial)?$/);
    return m && m[1] < cutoff;
  });
}

/** Run a command; resolves { status, stdout, stderr, error }. */
export function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawnChild(cmd, args, { ...opts, windowsHide: true });
    } catch (error) {
      resolve({ status: null, stdout, stderr, error });
      return;
    }
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ status: null, stdout, stderr, error }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/** A TCP relay from 127.0.0.1:<random> to host:port, for the life of the run. */
export function startRelay(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      const upstream = net.connect({ host, port: Number(port) });
      client.pipe(upstream).pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on('error', close);
      upstream.on('error', close);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve({ port: server.address().port, close: () => server.close() })
    );
  });
}

function appendLog(logFile, entry) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

function describe(r) {
  if (r.error) return `spawn error: ${r.error.message}`;
  const err = (r.stderr || '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
  // Never echo anything that could be a credential.
  return `exit ${r.status}${err ? `: ${err.replace(/postgres(ql)?:\/\/\S+/g, '<url>')}` : ''}`;
}

export async function run({
  argv = process.argv,
  env = process.env,
  now = new Date(),
  probe = spawnSync,
  exec = runAsync,
  relay = startRelay,
  log = console.log,
} = {}) {
  const startedAt = now;
  const { root, retentionDays } = parseArgs(argv);
  const archives = path.join(root, 'archives');
  const logFile = path.join(root, 'logs', 'backup-intelliflow.jsonl');
  const entry = { task: 'backup-intelliflow-db', startedAt: startedAt.toISOString(), image: IMAGE };
  const finish = (result, extra) => {
    const line = { ...entry, ...extra, result, finishedAt: new Date().toISOString() };
    appendLog(logFile, line);
    log(`[backup-intelliflow-db] ${result}${extra.reason ? `: ${extra.reason}` : ''}`);
    return { result, ...extra };
  };

  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    return finish('FAILURE', { reason: `invalid --retention-days: ${retentionDays}` });
  }
  const docker = probe('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
  if (docker.error || docker.status !== 0) {
    return finish('FAILURE', { reason: `Docker is not running (${describe(docker)})` });
  }
  const { url, source } = resolveDatabaseUrl(env);
  if (!url) return finish('FAILURE', { reason: `no database URL (set ${KEY} or ${OPS_ENV_FILE})` });
  let pg;
  try {
    pg = libpqEnv(url);
  } catch (e) {
    return finish('FAILURE', { reason: e.message, credentials: source });
  }
  entry.credentials = source;

  fs.mkdirSync(archives, { recursive: true });
  const name = dumpName(now);
  const partial = `${name}.partial`;
  const mount = ['-v', `${archives}:/backup`];
  let tunnel;
  try {
    tunnel = await relay(pg.PGHOST, pg.PGPORT);
  } catch (e) {
    return finish('FAILURE', { reason: `could not open the local relay: ${e.message}` });
  }
  // The container talks to the relay; TLS still runs end to end to the database.
  const childEnv = { ...env, ...pg, PGHOST: 'host.docker.internal', PGPORT: String(tunnel.port) };
  const envFlags = Object.keys(pg).flatMap((k) => ['-e', k]); // names only: values come from childEnv
  const hostGateway = ['--add-host=host.docker.internal:host-gateway'];

  const t0 = Date.now();
  let dump;
  try {
    dump = await exec(
      'docker',
      [
        'run',
        '--rm',
        ...hostGateway,
        ...envFlags,
        ...mount,
        '--entrypoint',
        'pg_dump',
        IMAGE,
        ...pgDumpArgs(`/backup/${partial}`),
      ],
      { env: childEnv }
    );
  } finally {
    tunnel.close();
  }
  const dumpMs = Date.now() - t0;
  const partialPath = path.join(archives, partial);
  if (dump.status !== 0 || !fs.existsSync(partialPath)) {
    fs.rmSync(partialPath, { force: true });
    return finish('FAILURE', { reason: `pg_dump failed (${describe(dump)})`, dumpMs });
  }

  const list = await exec('docker', [
    'run',
    '--rm',
    ...mount,
    '--entrypoint',
    'pg_restore',
    IMAGE,
    '--list',
    `/backup/${partial}`,
  ]);
  const withData = list.status === 0 ? tablesWithData(list.stdout) : new Set();
  const missing = REQUIRED_DATA.filter((t) => !withData.has(t));
  const leaked = EXCLUDED_DATA.filter((t) => withData.has(t));
  if (list.status !== 0 || missing.length || leaked.length) {
    fs.rmSync(partialPath, { force: true });
    return finish('FAILURE', {
      reason:
        list.status !== 0
          ? `pg_restore --list failed (${describe(list)})`
          : `dump check failed: missing data ${missing.join(',') || '-'}; excluded data present ${leaked.join(',') || '-'}`,
      dumpMs,
    });
  }
  const finalPath = path.join(archives, name);
  fs.rmSync(finalPath, { force: true }); // a second run on the same day replaces the first
  fs.renameSync(partialPath, finalPath);
  const bytes = fs.statSync(finalPath).size;

  const pruned = expiredDumps(fs.readdirSync(archives), now, retentionDays);
  for (const f of pruned) fs.rmSync(path.join(archives, f), { force: true });

  return finish('SUCCESS', {
    file: finalPath,
    bytes,
    dumpMs,
    tablesWithData: withData.size,
    excludedData: EXCLUDED_DATA.length,
    pruned,
    retentionDays,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().then((r) => process.exit(r.result === 'SUCCESS' ? 0 : 1));
}
