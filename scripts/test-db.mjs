#!/usr/bin/env node
/**
 * Ephemeral test database CLI (#271). See scripts/lib/ephemeral-test-db.mjs.
 *
 *   pnpm test:db:run [--seed] -- <command...>   create a fresh DB, run <command> against it, drop it
 *   pnpm test:db:up  [--seed]                   create a fresh DB, print its URL, leave it for you
 *   pnpm test:db:down <name>                    drop a DB that `up` created
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
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ENV_FILES, resolveEnv } from './lib/preship-integration-infra.mjs';
import { childEnv, provision, resolveServerUrl, teardown } from './lib/ephemeral-test-db.mjs';

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
    const name = flags.find((f) => !f.startsWith('--'));
    if (!name) throw new Error('usage: test-db down <database-name>');
    await teardown({ connect, serverUrl, name });
    process.stderr.write(`[test-db] dropped ${name}\n`);
    return 0;
  }

  if (command === 'run') {
    if (childArgv.length === 0) throw new Error('usage: test-db run [--seed] -- <command...>');
    const { name, url } = await provision({ ...deps(env, withSeed), serverUrl });
    process.stderr.write(`[test-db] using ephemeral ${name} on ${redact(serverUrl)}\n`);

    let child;
    const drop = () =>
      teardown({ connect, serverUrl, name }).then(
        () => process.stderr.write(`[test-db] dropped ${name}\n`),
        (e) => process.stderr.write(`[test-db] FAILED to drop ${name}: ${e.message}\n`)
      );
    // Only signals this process receives are handled; the child is the one we started.
    const onSignal = (signal) => () => {
      if (child && !child.killed) child.kill(signal);
    };
    process.on('SIGINT', onSignal('SIGINT'));
    process.on('SIGTERM', onSignal('SIGTERM'));

    const code = await new Promise((resolve) => {
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
      child.on('exit', (c, signal) => resolve(c ?? (signal ? 1 : 0)));
    });
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
