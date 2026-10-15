#!/usr/bin/env node
/**
 * Ephemeral test database CLI (#271). See scripts/lib/ephemeral-test-db.mjs.
 *
 *   pnpm test:db:run [--seed] -- <command...>   create a fresh DB, run <command> against it, drop it
 *   pnpm test:db:up  [--seed]                   create a fresh DB, print its URL, leave it for you
 *   pnpm test:db:down <name>                    drop a DB that `up` created
 *   pnpm test:db:down --stale [--older-than-min N]   drop leaked intelliflow_test_run_* DBs (default: older than 60 min)
 *
 * The server is resolved from the suite's own env (process env over .env.test.local,
 * .env.test, .env.local, .env — the same order vite's loadEnv('test') and the
 * pre-ship probe use), or TEST_DATABASE_ADMIN_URL when set. Local test containers
 * (5433, or remapped ports such as 25432) and CI service containers both work: only
 * the host and port in that URL matter. Non-local hosts are refused.
 *
 *   pnpm test:db:run -- pnpm test:integration
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ENV_FILES, resolveEnv } from './lib/preship-integration-infra.mjs';
import { childEnv, provision, resolveServerUrl, sweepStale, teardown } from './lib/ephemeral-test-db.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `pg` is a transitive dependency of @prisma/adapter-pg (a root dependency). */
function loadPg() {
  const fromRoot = createRequire(path.join(repoRoot, 'package.json'));
  const adapterEntry = fromRoot.resolve('@prisma/adapter-pg');
  return createRequire(adapterEntry)('pg');
}

async function connect(url) {
  const { Client } = loadPg();
  const client = new Client({ connectionString: url });
  await client.connect();
  return { query: (sql) => client.query(sql), end: () => client.end() };
}

function loadEnv() {
  const texts = ENV_FILES.map((f) => {
    try {
      return fs.readFileSync(path.join(repoRoot, f), 'utf8');
    } catch {
      return '';
    }
  });
  return resolveEnv(texts, process.env);
}

function pnpm(args, env) {
  const r = spawnSync('pnpm', args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new Error(`pnpm ${args.join(' ')} exited with ${r.status}`);
}

function deps(env, withSeed) {
  return {
    connect,
    migrate: (url) => pnpm(['--filter', '@intelliflow/db', 'db:migrate'], childEnv(env, url)),
    seed: withSeed
      ? (url) => pnpm(['--filter', '@intelliflow/db', 'db:seed'], childEnv(env, url))
      : undefined,
  };
}

function redact(url) {
  return url.replace(/:\/\/[^@/]*@/, '://***@');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const sep = rest.indexOf('--');
  const flags = sep === -1 ? rest : rest.slice(0, sep);
  const childArgv = sep === -1 ? [] : rest.slice(sep + 1);
  const withSeed = flags.includes('--seed');
  const env = loadEnv();
  const serverUrl = resolveServerUrl(env);

  if (command === 'up') {
    const { name, url } = await provision({ ...deps(env, withSeed), serverUrl });
    process.stderr.write(`[test-db] created ${name} on ${redact(serverUrl)}\n`);
    process.stderr.write(`[test-db] drop it with: pnpm test:db:down ${name}\n`);
    process.stdout.write(`TEST_DATABASE_URL=${url}\n`);
    return 0;
  }

  if (command === 'down') {
    if (flags.includes('--stale')) {
      const i = flags.indexOf('--older-than-min');
      const minutes = i === -1 ? 60 : Number(flags[i + 1]);
      if (!Number.isFinite(minutes) || minutes < 0) throw new Error('--older-than-min needs a number');
      const dropped = await sweepStale({ connect, serverUrl, olderThanMs: minutes * 60_000 });
      process.stderr.write(`[test-db] swept ${dropped.length} stale database(s)${dropped.length ? ': ' + dropped.join(', ') : ''}\n`);
      return 0;
    }
    const name = flags.find((f) => !f.startsWith('--'));
    if (!name) throw new Error('usage: test-db down <database-name>');
    await teardown({ connect, serverUrl, name });
    process.stderr.write(`[test-db] dropped ${name}\n`);
    return 0;
  }

  if (command === 'run') {
    if (childArgv.length === 0) throw new Error('usage: test-db run [--seed] -- <command...>');
    // Installed BEFORE provisioning: a kill that lands while the database is being
    // created or migrated (before any child exists) must still drop it.
    let child;
    let aborted = null;
    let name;
    const onSignal = (signal) => () => {
      aborted = signal;
      if (child && !child.killed) child.kill(signal);
    };
    const handlers = [
      ['SIGINT', onSignal('SIGINT')],
      ['SIGTERM', onSignal('SIGTERM')],
    ];
    for (const [sig, fn] of handlers) process.on(sig, fn);
    const cleanup = () => {
      for (const [sig, fn] of handlers) process.removeListener(sig, fn);
    };

    let url;
    try {
      ({ name, url } = await provision({ ...deps(env, withSeed), serverUrl }));
    } catch (e) {
      cleanup();
      throw e;
    }
    process.stderr.write(`[test-db] using ephemeral ${name} on ${redact(serverUrl)}\n`);
    const drop = () =>
      teardown({ connect, serverUrl, name }).then(
        () => process.stderr.write(`[test-db] dropped ${name}\n`),
        (e) => process.stderr.write(`[test-db] FAILED to drop ${name}: ${e.message}\n`)
      );

    const code = aborted
      ? 130
      : await new Promise((resolve) => {
          child = spawn(childArgv[0], childArgv.slice(1), {
            cwd: repoRoot,
            env: childEnv(env, url),
            stdio: 'inherit',
            shell: process.platform === 'win32',
          });
          child.on('error', (e) => {
            process.stderr.write(`[test-db] could not start command: ${e.message}\n`);
            resolve(1);
          });
          // A signal death is reported as the conventional 128+n, not a bare 1.
          child.on('exit', (c, signal) =>
            resolve(c ?? (signal ? 128 + (os.constants.signals[signal] ?? 1) : 0))
          );
        });
    cleanup();
    await drop();
    return code;
  }

  throw new Error('usage: test-db <up|down|run> ...');
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`[test-db] ${error.message}\n`);
    process.exit(1);
  }
);
