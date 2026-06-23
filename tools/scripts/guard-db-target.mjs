#!/usr/bin/env node
/**
 * guard-db-target.mjs — pre-flight guard for destructive Prisma/DB operations.
 *
 * It does NOT block the commands — it blocks only when the *resolved* target is
 * the WRONG environment: a destructive op (db push / reset / migrate dev) that
 * lands on a NON-LOCAL (prod) database. prisma.config.ts resolves
 * `DIRECT_URL ?? DATABASE_URL` from .env, so an inline DATABASE_URL does NOT
 * override a .env DIRECT_URL pointing at prod — which is how a test-intended
 * `pnpm db:push` hit prod Supabase on 2026-06-23. This resolves the same way
 * and aborts the prod hit.
 *
 * Wired into packages/db's `db:push`, `db:reset`, `db:migrate:dev`. The intended
 * production path (`db:migrate` = `prisma migrate deploy`) is NOT guarded.
 *
 * Deliberate prod op: prefix with `ALLOW_PROD_DB_OPS=1`.
 * Usage: node tools/scripts/guard-db-target.mjs <op-label>
 */
import { resolve } from 'node:path';
import { resolveDbUrl, isLocalUrl, hostOf } from './lib/db-target.mjs';

const op = process.argv[2] || 'destructive DB operation';

if (process.env.ALLOW_PROD_DB_OPS === '1') {
  process.stderr.write(`[db-guard] ALLOW_PROD_DB_OPS=1 — permitting ${op}.\n`);
  process.exit(0);
}

// Inline = the actual process.env (real overrides) win; .env (cwd) fills gaps —
// exactly what prisma.config.ts sees via `import 'dotenv/config'`.
const { url } = resolveDbUrl({
  inline: { DIRECT_URL: process.env.DIRECT_URL, DATABASE_URL: process.env.DATABASE_URL },
  envPaths: [resolve(process.cwd(), '.env')],
});

function block(reason) {
  const masked = url.replace(/:\/\/[^@]*@/, '://***@');
  process.stderr.write(`\n\x1b[1;31m[db-guard] BLOCKED: ${op}\x1b[0m\n`);
  process.stderr.write(`  ${reason}\n`);
  process.stderr.write(`  resolved target: ${masked || '(none resolved)'}\n\n`);
  process.stderr.write(
    `prisma.config.ts uses DIRECT_URL ?? DATABASE_URL from .env — an inline DATABASE_URL\n` +
      `does NOT override a .env DIRECT_URL. To target the LOCAL test DB, set BOTH:\n\n` +
      `  DIRECT_URL="postgresql://postgres:postgres@localhost:5433/intelliflow_test?schema=public" \\\n` +
      `  DATABASE_URL="postgresql://postgres:postgres@localhost:5433/intelliflow_test?schema=public" \\\n` +
      `  pnpm --filter @intelliflow/db <script>\n\n` +
      `For a DELIBERATE production operation: ALLOW_PROD_DB_OPS=1 (prefer migrate deploy over db push).\n\n`
  );
  process.exit(1);
}

if (!url) block('No DATABASE_URL/DIRECT_URL resolved — refusing to run blind.');
if (!isLocalUrl(url)) block(`Target host "${hostOf(url)}" is NOT local — almost certainly PRODUCTION.`);

process.stderr.write(`[db-guard] OK — ${op} targets local host "${hostOf(url)}".\n`);
process.exit(0);
