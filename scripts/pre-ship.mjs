#!/usr/bin/env node
/**
 * Local pre-ship gate — mirrors CI's required-check graph so failures
 * surface on the dev laptop (free, fast feedback) instead of after a
 * 5-min wait + queued CI run.
 *
 * Wired into .husky/pre-push (default on). Override with SKIP_PRESHIP=1
 * when you genuinely need to push something the gate would reject
 * (record the reason in the commit/PR body).
 *
 * Resumable: writes per-step exit codes + timing to
 * artifacts/preship/last-run.json, keyed by git HEAD. Re-running with
 * the same HEAD skips steps that previously PASSed — only re-runs FAIL
 * or NOT_RUN steps. Use `--clean` to force re-run all steps.
 *
 * Step plan mirrors audit doc §8 (the 17-step belt-and-suspenders gate
 * the maintainer chose explicitly). Each step is its own subprocess so
 * a failure in one doesn't poison the next's exit code.
 *
 * Exit codes:
 *   0  — all steps PASS (or SKIPPED-because-cached-PASS)
 *   1  — at least one step FAIL or required-step SKIPPED-because-precondition
 *   2  — usage error (e.g. --bad-flag)
 *
 * Required steps with unmet preconditions (e.g. Docker stack not running for
 * integration tests) FAIL the gate by default. This is intentional: a
 * "silently skipped" required step gives false confidence (gate green
 * locally, CI red afterward). Override with PRESHIP_ALLOW_MISSING=1 when
 * you've explicitly accepted the gap (e.g. doc-only push that genuinely
 * can't break integration).
 *
 * Per-step output goes to artifacts/preship/logs/<step-id>.log so the
 * developer can see what broke without re-running.
 *
 * Usage:
 *   node scripts/pre-ship.mjs            # run the full gate (cache hits)
 *   node scripts/pre-ship.mjs --clean    # force re-run all steps
 *   node scripts/pre-ship.mjs --list     # show the step plan, exit 0
 *   node scripts/pre-ship.mjs --only=lint,typecheck  # run subset only
 *
 * Env:
 *   PRESHIP_KEEP_GOING=1     don't hard-stop on first required FAIL
 *   PRESHIP_ALLOW_MISSING=1  let required+SKIPPED_PRECONDITION steps pass
 *   SKIP_PRESHIP=1           bypass the gate entirely (husky pre-push only)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/preship');
const LOG_DIR = path.join(OUT_DIR, 'logs');
const STATE_PATH = path.join(OUT_DIR, 'last-run.json');

// Step plan — 17 steps from audit doc §8. Each step has:
//   id          : kebab-case identifier (also used as log filename)
//   description : human-readable label printed during the run
//   cmd         : argv to spawn (no shell, never a single string)
//   skip_if     : optional () => boolean — true means SKIP (e.g. docker
//                 services not running, no integration tests possible).
//                 Skipped steps are NOT cached as PASS; they re-evaluate
//                 every run.
//   required    : if false, step failure is reported but doesn't fail
//                 the overall gate. Only `architecture` is non-required
//                 because the sub-project install is `continue-on-error`
//                 in CI too.
const STEPS = [
  {
    id: 'install',
    description: 'pnpm install --frozen-lockfile (sanity-check lockfile against package.json)',
    cmd: ['pnpm', 'install', '--frozen-lockfile'],
    required: true,
  },
  {
    id: 'library-build',
    description: 'turbo run build for library packages (typecheck/test depend on dist/)',
    cmd: [
      'pnpm',
      'exec',
      'turbo',
      'run',
      'build',
      '--filter=!@intelliflow/web',
      '--filter=!@intelliflow/api',
      '--filter=!@intelliflow/project-tracker',
      '--filter=!@intelliflow/workers',
    ],
    required: true,
  },
  {
    id: 'format-check',
    description: 'prettier --check (catches the YAML/json format drift CI hits)',
    cmd: ['pnpm', 'run', 'format:check'],
    required: true,
  },
  {
    id: 'lint',
    description: 'turbo run lint (full monorepo)',
    cmd: ['pnpm', 'run', 'lint'],
    required: true,
  },
  {
    id: 'typecheck',
    description: 'turbo run typecheck + sonar-guard',
    cmd: ['pnpm', 'run', 'typecheck'],
    required: true,
  },
  {
    id: 'lint-artifacts',
    description: 'artifact-path linter (catches misplaced reports/logs)',
    cmd: ['pnpm', 'run', 'lint:artifacts'],
    required: true,
  },
  {
    id: 'lint-runtime-paths',
    description: 'runtime-path linter',
    cmd: ['pnpm', 'run', 'lint:runtime-paths'],
    required: true,
  },
  {
    id: 'material-symbols-audit',
    description: 'Material Symbols glyph-audit (no tofu icons)',
    cmd: ['pnpm', '--filter', '@intelliflow/web', 'audit:material-symbols'],
    required: true,
  },
  {
    id: 'a11y-routes',
    description: 'a11y route reconciliation (VALIDATION_STRICT=1)',
    cmd: ['pnpm', 'run', 'validate:a11y-routes'],
    env: { VALIDATION_STRICT: '1' },
    required: true,
  },
  {
    id: 'unit-tests',
    description: 'vitest run --project unit',
    cmd: ['pnpm', 'run', 'test:unit'],
    required: true,
  },
  {
    id: 'integration-tests',
    description:
      'vitest run --project integration (FAILS the gate if Docker postgres/redis not up — override with PRESHIP_ALLOW_MISSING=1)',
    cmd: ['pnpm', 'run', 'test:integration'],
    skip_if: () => {
      // Probe Docker for postgres + redis on the conventional ports.
      const r = spawnSync(
        'docker',
        ['ps', '--filter', 'name=postgres', '--filter', 'name=redis', '-q'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        }
      );
      if (r.error || r.status !== 0) return true;
      return !r.stdout.trim();
    },
    skip_remediation:
      'Start the local stack: `docker compose -f docker-compose.yml up -d postgres redis`. Then re-run, or set PRESHIP_ALLOW_MISSING=1 to bypass for this push only.',
    required: true,
  },
  {
    id: 'coverage',
    description: 'pnpm run test:coverage (merged Istanbul output)',
    cmd: ['pnpm', 'run', 'test:coverage'],
    required: true,
  },
  {
    id: 'build',
    description: 'pnpm run build (full prod build — catches Next.js page-data collection issues)',
    cmd: ['pnpm', 'run', 'build'],
    // CI's Build job sets a wall of env stubs for module-load guards
    // (Prisma encryption, AI audit signing, Supabase). Mirror locally
    // so a stub env doesn't silently fail differently from CI.
    env: {
      NODE_ENV: 'production',
      PRISMA_FIELD_ENCRYPTION_KEY:
        process.env.PRISMA_FIELD_ENCRYPTION_KEY || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      AI_AUDIT_SIGNING_KEY:
        process.env.AI_AUDIT_SIGNING_KEY || 'ci-build-stub-key-not-used-at-runtime',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub',
      DIRECT_URL: process.env.DIRECT_URL || 'postgresql://stub:stub@localhost:5432/stub',
      SUPABASE_URL: process.env.SUPABASE_URL || 'https://stub.supabase.co',
      SUPABASE_ANON_KEY:
        process.env.SUPABASE_ANON_KEY ||
        'ci-stub-anon-not-a-real-supabase-key-do-not-use-at-runtime',
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        'ci-stub-service-role-not-a-real-supabase-key-do-not-use-at-runtime',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://stub.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'ci-stub-anon-not-a-real-supabase-key-do-not-use-at-runtime',
    },
    required: true,
  },
  {
    id: 'audit',
    description: 'pnpm audit --audit-level=high (matches security.yml after PR1)',
    cmd: ['pnpm', 'audit', '--audit-level=high'],
    required: true,
  },
  {
    id: 'gitleaks',
    description: 'gitleaks protect --staged (secret scan)',
    cmd: ['gitleaks', 'protect', '--staged', '--redact', '--config=.gitleaks.toml', '--no-banner'],
    skip_if: () => {
      // gitleaks is optional — skip if not on PATH.
      const r = spawnSync('gitleaks', ['version'], {
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      return r.error !== undefined || r.status !== 0;
    },
    required: false,
  },
  {
    id: 'architecture',
    description: 'tests/architecture (hexagonal boundary checks)',
    cmd: ['pnpm', 'test'],
    cwd: path.join(REPO_ROOT, 'tests/architecture'),
    required: false,
  },
  {
    id: 'validate-sprint-data',
    description: 'sprint data validator',
    cmd: ['pnpm', 'run', 'validate:sprint-data'],
    required: true,
  },
];

const args = process.argv.slice(2);
const flags = {
  clean: args.includes('--clean'),
  list: args.includes('--list'),
  only: null,
};
for (const a of args) {
  if (a.startsWith('--only=')) flags.only = a.slice('--only='.length).split(',');
}

if (flags.list) {
  for (const s of STEPS) {
    console.log(`  ${s.id.padEnd(28)}  ${s.description}`);
  }
  process.exit(0);
}

function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

function loadPreviousState(head) {
  if (flags.clean) return null;
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return s.git_head === head ? s : null;
  } catch {
    return null;
  }
}

function ensureDirs() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function runStep(step, prev) {
  const logPath = path.join(LOG_DIR, `${step.id}.log`);

  if (flags.only && !flags.only.includes(step.id)) {
    return { id: step.id, verdict: 'SKIPPED_NOT_SELECTED', duration_ms: 0 };
  }

  if (step.skip_if && step.skip_if()) {
    return {
      id: step.id,
      verdict: 'SKIPPED_PRECONDITION',
      duration_ms: 0,
      required: step.required !== false,
      skip_remediation: step.skip_remediation,
    };
  }

  const cached = prev?.steps?.find((s) => s.id === step.id);
  if (cached && cached.verdict === 'PASS') {
    return { ...cached, verdict: 'CACHED_PASS' };
  }

  const start = Date.now();
  const env = { ...process.env, ...(step.env || {}) };
  // shell:true on Windows so the PATH resolves .cmd/.exe extensions for
  // pnpm / gitleaks / etc. All argv values are hard-coded literals (no
  // user input), so shell injection isn't a concern. POSIX systems use
  // shell:false to avoid the extra fork.
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    cwd: step.cwd || REPO_ROOT,
    shell: process.platform === 'win32',
  });
  const duration_ms = Date.now() - start;

  const output = (r.stdout || '') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '');
  fs.writeFileSync(logPath, output);

  const failed = r.status !== 0;
  return {
    id: step.id,
    description: step.description,
    cmd: step.cmd.join(' '),
    duration_ms,
    exit_code: r.status ?? -1,
    verdict: failed ? 'FAIL' : 'PASS',
    required: step.required !== false,
    log_path: path.relative(REPO_ROOT, logPath),
  };
}

function emoji(v) {
  return (
    {
      PASS: '✓',
      CACHED_PASS: '✓·',
      FAIL: '✗',
      SKIPPED_PRECONDITION: '·',
      SKIPPED_NOT_SELECTED: '-',
      MISSING: '!',
    }[v] || '?'
  );
}

// A required step that was SKIPPED_PRECONDITION counts as MISSING — i.e.
// the gate cannot honestly say PASS because a guard couldn't run. Only
// SKIPPED_NOT_SELECTED (developer used --only) and CACHED_PASS (proven
// good earlier) and non-required SKIPPED_PRECONDITION are honest skips.
function isMissingRequired(r) {
  return r.verdict === 'SKIPPED_PRECONDITION' && r.required === true;
}

function main() {
  ensureDirs();
  const head = gitHead();
  const prev = loadPreviousState(head);
  if (prev) {
    process.stdout.write(
      `pre-ship: resuming from previous run at ${head.slice(0, 8)} (cached PASSes will be skipped).\n`
    );
  } else {
    process.stdout.write(`pre-ship: fresh run at ${head.slice(0, 8)}.\n`);
  }
  process.stdout.write('\n');

  const results = [];
  const totalStart = Date.now();
  let aborted = false;

  const allowMissing = process.env.PRESHIP_ALLOW_MISSING === '1';

  for (const step of STEPS) {
    if (aborted) {
      results.push({ id: step.id, verdict: 'NOT_RUN', duration_ms: 0 });
      continue;
    }
    process.stdout.write(`  ${step.id.padEnd(28)} `);
    const r = runStep(step, prev);
    results.push(r);

    // Re-label a required+SKIPPED_PRECONDITION as MISSING so the line is
    // visually distinct from harmless skips (gitleaks not installed, etc).
    const displayVerdict = isMissingRequired(r) && !allowMissing ? 'MISSING' : r.verdict;
    process.stdout.write(
      `${emoji(displayVerdict)} ${displayVerdict}  (${fmtDuration(r.duration_ms)})\n`
    );

    if (isMissingRequired(r)) {
      if (allowMissing) {
        process.stdout.write(
          `    PRESHIP_ALLOW_MISSING=1 set — accepting that this required guard could not run.\n`
        );
      } else if (r.skip_remediation) {
        process.stdout.write(`    Remediation: ${r.skip_remediation}\n`);
      }
    }

    // Hard-stop on a required FAIL — no point burning more time when
    // the developer has to fix this one first anyway. Override by
    // setting PRESHIP_KEEP_GOING=1 to see ALL failures.
    if (r.verdict === 'FAIL' && r.required !== false && process.env.PRESHIP_KEEP_GOING !== '1') {
      aborted = true;
      process.stdout.write(`\n  ✗ Required step failed: ${step.id} — aborting subsequent steps.\n`);
      process.stdout.write(`    Log: ${r.log_path}\n`);
      process.stdout.write(`    (Set PRESHIP_KEEP_GOING=1 to run remaining steps anyway.)\n`);
    }
  }

  const totalDuration = Date.now() - totalStart;
  const fails = results.filter((r) => r.verdict === 'FAIL' && r.required !== false);
  const missing = allowMissing ? [] : results.filter(isMissingRequired);
  const verdict = fails.length === 0 && missing.length === 0 ? 'PASS' : 'FAIL';

  const state = {
    git_head: head,
    started_at: new Date(totalStart).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: totalDuration,
    verdict,
    steps: results,
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  process.stdout.write('\n');
  process.stdout.write(`pre-ship: ${verdict} in ${fmtDuration(totalDuration)}.\n`);
  if (fails.length > 0) {
    process.stdout.write(`  Failed required steps:\n`);
    for (const f of fails) process.stdout.write(`    - ${f.id} (see ${f.log_path})\n`);
  }
  if (missing.length > 0) {
    process.stdout.write(`  Required steps that could not run (treated as FAIL):\n`);
    for (const m of missing) {
      process.stdout.write(`    - ${m.id}\n`);
      if (m.skip_remediation) process.stdout.write(`      → ${m.skip_remediation}\n`);
    }
    process.stdout.write(
      `  Set PRESHIP_ALLOW_MISSING=1 if you've accepted the gap for this push.\n`
    );
  }
  process.stdout.write(`  State: ${path.relative(REPO_ROOT, STATE_PATH)}\n`);

  process.exit(verdict === 'PASS' ? 0 : 1);
}

main();
