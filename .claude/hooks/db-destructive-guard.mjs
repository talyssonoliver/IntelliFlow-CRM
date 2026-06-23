#!/usr/bin/env node
/**
 * db-destructive-guard.mjs — PreToolUse hook for Bash.
 *
 * Does NOT block the prisma commands themselves — you use them on the test DB.
 * It blocks ONLY the dangerous MISMATCH: a RAW destructive prisma subcommand
 * (db push / migrate reset / migrate dev / db execute) whose RESOLVED datasource
 * is a NON-LOCAL (production) database while the deliberate ALLOW_PROD_DB_OPS=1
 * flag is absent — i.e. an agent that thinks it is on test but would hit prod
 * (the 2026-06-23 incident). It resolves the target exactly as prisma.config.ts
 * does: DIRECT_URL ?? DATABASE_URL, from inline env overrides then .env.
 *
 * Companion to tools/scripts/guard-db-target.mjs (which guards the pnpm db:*
 * scripts). This covers RAW prisma invocations that bypass those scripts.
 */
import { resolve } from 'node:path';
import { resolveDbUrl, isLocalUrl, hostOf } from '../../tools/scripts/lib/db-target.mjs';

const DESTRUCTIVE = /\bprisma\s+(?:db\s+push|migrate\s+reset|migrate\s+dev|db\s+execute)\b/;

function inlineVar(cmd, name) {
  const m = cmd.match(new RegExp(`(?:^|\\s)${name}=("[^"]*"|'[^']*'|\\S+)`));
  if (!m) return undefined;
  let v = m[1];
  if ((v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
  return v;
}

function check(sub) {
  if (!DESTRUCTIVE.test(sub)) return null; // not a destructive prisma op
  if (/\bALLOW_PROD_DB_OPS\s*=\s*1\b/.test(sub)) return null; // intent = prod, declared

  const { url } = resolveDbUrl({
    inline: {
      DIRECT_URL: inlineVar(sub, 'DIRECT_URL'),
      DATABASE_URL: inlineVar(sub, 'DATABASE_URL'),
    },
    envPaths: [resolve(process.cwd(), 'packages/db/.env'), resolve(process.cwd(), '.env')],
  });

  if (!url) return null; // can't resolve a target — don't block blindly
  if (isLocalUrl(url)) return null; // targets the local/test DB — allowed

  return (
    `This destructive prisma command resolves to a NON-LOCAL database (host ` +
    `"${hostOf(url)}", almost certainly PRODUCTION), but ALLOW_PROD_DB_OPS=1 was not ` +
    `set. prisma reads DIRECT_URL ?? DATABASE_URL from .env, which points at prod — ` +
    `so an inline DATABASE_URL alone will NOT redirect it. If you meant the TEST DB, ` +
    `set BOTH DIRECT_URL and DATABASE_URL to :5433. If you genuinely intend ` +
    `PRODUCTION, prefix the command with ALLOW_PROD_DB_OPS=1.`
  );
}

async function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const command = data?.tool_input?.command;
  if (!command) process.exit(0);

  for (const sub of String(command).split(/&&|\|\||;|\n/)) {
    let reason = null;
    try {
      reason = check(sub.trim());
    } catch {
      reason = null; // never fail-closed on a guard bug
    }
    if (reason) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `[DB Safety Guard] BLOCKED: ${reason}`,
          },
        })
      );
      process.exit(0);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
