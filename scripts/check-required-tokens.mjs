#!/usr/bin/env node
/**
 * Fail-first token / secret gate — the FIRST step of the pre-ship pipeline.
 *
 * Motivation (2026-06-04): several CI/CD/deploy jobs are red ONLY because a
 * required token/secret/runtime-env was unset (or pointed at the wrong place).
 * Those failures cost a full ~10-min CI round to discover. This gate surfaces a
 * missing token in seconds, on the dev laptop, BEFORE any test/build/coverage
 * work runs — so "the token isn't set" fails first, loudly, with a remediation.
 *
 * Scopes checked:
 *   gh-secret       GitHub Actions repo secret  (CI/CD jobs read secrets.*)
 *   vercel-prod-env Vercel PRODUCTION env var   (the running app — the 500 surface)
 *
 * Verifiability-aware: a scope is only allowed to BLOCK when it can actually be
 * inspected. If `gh` is not authenticated, gh-secret checks degrade to UNKNOWN
 * (warn, don't block) — a developer who can't read secrets can't set them
 * either; the gate is most useful for the maintainer who can. The Vercel scope
 * is best-effort (network) and never hard-blocks unless --strict-vercel is set.
 *
 * Exit codes:
 *   0  all blocking tokens present (or scope unverifiable)
 *   1  at least one blocking token is verifiably MISSING
 *   2  usage error
 *
 * Flags / env:
 *   --json            machine-readable output
 *   --strict-vercel   let a verifiably-missing vercel-prod-env token BLOCK
 *   TOKENS_SKIP=1     skip the gate entirely (mirrors SKIP_PRESHIP semantics)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const STRICT_VERCEL = args.includes('--strict-vercel');
for (const a of args) {
  if (!['--json', '--strict-vercel'].includes(a)) {
    process.stderr.write(`check-required-tokens: unknown argument '${a}'\n`);
    process.exit(2);
  }
}

if (process.env.TOKENS_SKIP === '1') {
  process.stdout.write('check-required-tokens: TOKENS_SKIP=1 — skipping token gate.\n');
  process.exit(0);
}

// --- Manifest -------------------------------------------------------------
// blocking: a verifiably-missing value fails the gate.
// scope:    where the value must live for the dependent jobs to go green.
const TOKENS = [
  // SonarCloud quality gate — blocks PR merge when absent.
  {
    name: 'SONAR_TOKEN',
    scope: 'gh-secret',
    blocking: true,
    why: 'SonarCloud quality gate (Unit Tests (sharded) / SonarCloud Scan) blocks merge',
  },

  // Module-load guards: unset at build OR runtime => Next.js page-data collect
  // throws / the deployed app 500s on every route. Needed as BOTH a gh-secret
  // (cd.yml build) and a Vercel production env (runtime).
  {
    name: 'PRISMA_FIELD_ENCRYPTION_KEY',
    scope: 'both',
    blocking: true,
    why: 'Prisma field encryption — module-init throw if unset',
  },
  {
    name: 'AI_AUDIT_SIGNING_KEY',
    scope: 'both',
    blocking: true,
    why: 'AI audit signing — module-init throw if unset',
  },
  { name: 'SUPABASE_URL', scope: 'both', blocking: true, why: 'Supabase client construction' },
  { name: 'SUPABASE_ANON_KEY', scope: 'both', blocking: true, why: 'Supabase client construction' },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    scope: 'both',
    blocking: true,
    why: 'Supabase service-role client',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    scope: 'both',
    blocking: true,
    why: 'Browser Supabase client (public)',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    scope: 'both',
    blocking: true,
    why: 'Browser Supabase client (public)',
  },

  // Deploy / cache plumbing — degrade gracefully in CI (stubs / skip steps), so
  // report-only: their absence shouldn't block a push.
  {
    name: 'VERCEL_TOKEN',
    scope: 'gh-secret',
    blocking: false,
    why: 'CI-gated Vercel deploys (deploy-preview.yml / cd.yml)',
  },
  { name: 'RAILWAY_TOKEN', scope: 'gh-secret', blocking: false, why: 'Railway deploy' },
  {
    name: 'TURBO_TOKEN',
    scope: 'gh-secret',
    blocking: false,
    why: 'Turbo remote cache (optional)',
  },
  { name: 'CODECOV_TOKEN', scope: 'gh-secret', blocking: false, why: 'Codecov upload (optional)' },
];

// --- Helpers --------------------------------------------------------------
function sh(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: opts.timeout ?? 20000,
    ...opts,
  });
}

function loadDotEnvLocal() {
  // Look up from cwd (repo root) for .env.local; values used only to obtain a
  // Vercel token for the read-only `vercel env ls`. Never printed.
  const p = path.join(process.cwd(), '.env.local');
  const out = {};
  try {
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    /* no .env.local — fine */
  }
  return out;
}

// gh secret names (repo). Returns Set or null if unverifiable.
function ghSecretNames() {
  const auth = sh('gh', ['auth', 'status'], { timeout: 10000 });
  if (auth.status !== 0) return null; // not authenticated → unverifiable
  const r = sh('gh', ['secret', 'list', '--json', 'name', '-q', '.[].name'], { timeout: 15000 });
  if (r.status !== 0) return null;
  return new Set(
    (r.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

// Vercel PRODUCTION env var names. Returns Set or null if unverifiable.
function vercelProdEnvNames(env) {
  const token = env.VERCEL_TOKEN || process.env.VERCEL_TOKEN;
  if (!token) return null;
  // Relies on .vercel/project.json for project linkage (the correct CRM project).
  const r = sh('vercel', ['env', 'ls', 'production', '--token', token], { timeout: 25000 });
  if (r.status !== 0) return null;
  const names = new Set();
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z0-9_]+)\s/);
    if (m) names.add(m[1]);
  }
  return names.size ? names : null;
}

// --- Evaluate -------------------------------------------------------------
const dotenv = loadDotEnvLocal();
const ghNames = ghSecretNames();
const vercelNames = vercelProdEnvNames(dotenv);

const results = [];
for (const t of TOKENS) {
  const checks = [];
  const wantsGh = t.scope === 'gh-secret' || t.scope === 'both';
  const wantsVercel = t.scope === 'vercel-prod-env' || t.scope === 'both';

  if (wantsGh) {
    if (ghNames === null) checks.push({ scope: 'gh-secret', state: 'UNKNOWN', blocks: false });
    else
      checks.push({
        scope: 'gh-secret',
        state: ghNames.has(t.name) ? 'PRESENT' : 'MISSING',
        blocks: t.blocking,
      });
  }
  if (wantsVercel) {
    if (vercelNames === null)
      checks.push({ scope: 'vercel-prod-env', state: 'UNKNOWN', blocks: false });
    else
      checks.push({
        scope: 'vercel-prod-env',
        state: vercelNames.has(t.name) ? 'PRESENT' : 'MISSING',
        blocks: t.blocking && STRICT_VERCEL,
      });
  }
  results.push({ name: t.name, blocking: t.blocking, why: t.why, checks });
}

const blockingMisses = results.flatMap((r) =>
  r.checks
    .filter((c) => c.state === 'MISSING' && c.blocks)
    .map((c) => ({ name: r.name, scope: c.scope, why: r.why }))
);

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ results, blockingMisses }, null, 2) + '\n');
  process.exit(blockingMisses.length ? 1 : 0);
}

// --- Render ---------------------------------------------------------------
const icon = { PRESENT: '✓', MISSING: '✗', UNKNOWN: '?' };
process.stdout.write(
  'check-required-tokens: verifying required tokens/secrets before pre-ship work…\n\n'
);
if (ghNames === null)
  process.stdout.write('  (gh not authenticated — gh-secret checks are advisory only)\n');
if (vercelNames === null)
  process.stdout.write(
    '  (no VERCEL_TOKEN / vercel CLI — vercel-prod-env checks are advisory only)\n'
  );
if (ghNames === null || vercelNames === null) process.stdout.write('\n');

for (const r of results) {
  const parts = r.checks.map((c) => `${c.scope}:${icon[c.state] || '?'}${c.state}`).join('  ');
  const tag = r.blocking ? 'BLOCKING' : 'optional';
  process.stdout.write(`  ${r.name.padEnd(30)} [${tag.padEnd(8)}]  ${parts}\n`);
}

process.stdout.write('\n');
if (blockingMisses.length) {
  process.stdout.write('✗ FAIL — required tokens are missing:\n');
  for (const m of blockingMisses) {
    process.stdout.write(`    - ${m.name} (${m.scope}) — ${m.why}\n`);
    if (m.scope === 'gh-secret') {
      process.stdout.write(
        `      Fix: gh secret set ${m.name}   (or, if you cannot: run /codex to ship it)\n`
      );
    } else {
      process.stdout.write(
        `      Fix: vercel env add ${m.name} production   (or run /codex to ship it)\n`
      );
    }
  }
  process.stdout.write(
    '\n  Set TOKENS_SKIP=1 to bypass this gate for a push you have accepted the gap for.\n'
  );
  process.exit(1);
}

process.stdout.write(
  '✓ PASS — all blocking tokens present (unverifiable scopes treated as advisory).\n'
);
process.exit(0);
