#!/usr/bin/env node
/**
 * Local pre-ship gate — mirrors CI's required-check graph so failures
 * surface on the dev laptop (free, fast feedback) instead of after a
 * 5-min wait + queued CI run.
 *
 * Wired into .husky/pre-push and runs on EVERY branch push. There is NO
 * SKIP_PRESHIP full-bypass (removed in the #265 retro — a gate skippable by one
 * env var is a gate that rots). A genuinely-unrunnable infra step (e.g. no local
 * test DB) degrades to MISSING-required, acknowledgeable with
 * PRESHIP_ALLOW_MISSING=1 (runs everything else, records the gap). The only full
 * escape is the deliberate `git push --no-verify`.
 *
 * Resumable: writes per-step exit codes + timing to
 * artifacts/preship/last-run.json, keyed by git HEAD. Re-running with
 * the same HEAD skips steps that previously PASSed — only re-runs FAIL
 * or NOT_RUN steps. Use `--clean` to force re-run all steps.
 *
 * Step plan mirrors audit doc §8 (the belt-and-suspenders gate the
 * maintainer chose explicitly) + a fail-first token gate prepended
 * 2026-06-04. Each step is its own subprocess so
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
 *   node scripts/pre-ship.mjs            # run the standard gate (cache hits)
 *   node scripts/pre-ship.mjs --clean    # force re-run all steps
 *   node scripts/pre-ship.mjs --list     # show the step plan, exit 0
 *   node scripts/pre-ship.mjs --help     # print usage + modes, exit 0
 *   node scripts/pre-ship.mjs --only=lint,typecheck  # run subset only
 *   node scripts/pre-ship.mjs --full     # standard gate + FULL cross-browser E2E
 *
 * Modes:
 *   standard (default) — the required-check graph mirrored locally. Single-browser
 *                        E2E only (the fast `smoke`/`chromium` projects); the
 *                        default push gate, kept under the ~45-min PR budget.
 *   --full             — the standard gate PLUS Playwright against the FULL browser
 *                        matrix (chromium + firefox + webkit). Opt-in: heavy
 *                        (2+ hours), for pre-release / large-PR confidence and the
 *                        `preship-full-nightly.yml` scheduled run against main. It
 *                        is NOT the per-push default. Equivalent env: PRESHIP_MODE=full.
 *                        The log prints the standard-gate verdict and the
 *                        full-matrix-E2E verdict as SEPARATE lines. See
 *                        docs/dev/preship-full.md.
 *
 * Env:
 *   PRESHIP_MODE=full        same as passing --full
 *   PRESHIP_KEEP_GOING=1     don't hard-stop on first required FAIL
 *   PRESHIP_ALLOW_MISSING=1  let required+SKIPPED_PRECONDITION steps pass
 *                            (infra-unrunnable steps only; NOT a full bypass)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Resolve REPO_ROOT from git rather than cwd so the script behaves
// identically whether invoked from the repo root, from a subdirectory,
// or by a Husky hook that has cd'd somewhere unexpected. Falls back to
// cwd only if `git rev-parse` fails (e.g. run outside a git tree — in
// which case the gate is meaningless anyway and we exit downstream).
function detectRepoRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (r.status === 0 && r.stdout) {
    return r.stdout.trim().replace(/\\/g, '/');
  }
  return process.cwd();
}
const REPO_ROOT = detectRepoRoot();
// Chdir so every spawned step inherits the repo-root cwd unless it
// explicitly overrides via `cwd:` (e.g. the architecture step).
process.chdir(REPO_ROOT);
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/preship');
const LOG_DIR = path.join(OUT_DIR, 'logs');
const STATE_PATH = path.join(OUT_DIR, 'last-run.json');

// Shared skip_if probes. The DB-backed steps (integration, coverage, and the
// two coverage gates that consume the lcov) can't run without a local test DB.
// Since the SKIP_PRESHIP full-bypass was removed, these degrade to
// MISSING-required (acknowledge with PRESHIP_ALLOW_MISSING=1) instead of
// hard-failing — so a DB-less env can still push the rest of the gate without a
// wholesale skip. NOTE: this only detects "no DB stack"; pointing DATABASE_URL
// at the correct (non-prod) DB remains the developer's responsibility.
function dbStackUnavailable() {
  const r = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    // Bound the probe: a WEDGED daemon makes `docker ps` hang indefinitely, which
    // would stall the whole gate before the SKIPPED_PRECONDITION logic runs. On
    // timeout spawnSync returns a null status → treated as "db stack unavailable".
    timeout: 10000,
  });
  if (r.error || r.status !== 0) return true; // docker missing / daemon down / probe timed out
  const names = (r.stdout || '').toLowerCase();
  return !(names.includes('postgres') && names.includes('redis'));
}
// The coverage gates need the merged lcov the `coverage` step produces; if that
// step was skipped (no DB), they have nothing to read.
function lcovMissing() {
  return !fs.existsSync(path.join(REPO_ROOT, 'artifacts/coverage/lcov.info'));
}

// Probe whether an optional IaC CLI (terraform / actionlint) is installed.
// Missing -> the step SKIPs locally (CI still enforces it). Spawned with a shell
// on win32 so PATH .exe/.cmd resolution works. NOTE: these local IaC gates catch
// formatting + workflow-syntax issues; they CANNOT catch GitHub-Actions token /
// SARIF-permission failures, which only manifest on GitHub's runners.
function commandMissing(bin) {
  const r = spawnSync(bin, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return !!r.error || r.status !== 0;
}

// Resolve a Python interpreter for the audit's commit-message linter
// (tools/audit/commit_msg_lint.py — the SAME script CI's system-audit runs).
// Returns the binary name, or null when neither is installed (the
// commit-msg-lint step then SKIPs locally; CI still enforces it).
function resolvePython() {
  for (const bin of ['python', 'python3']) {
    if (!commandMissing(bin)) return bin;
  }
  return null;
}
const PYTHON_BIN = resolvePython();

// Resolve a dependency-CVE scanner for the OSV parity gate (#485). CI runs both
// osv-scanner (google/osv-scanner-action, against pnpm-lock.yaml) and Trivy
// (aquasecurity/trivy-action, `fs` scan) in .github/workflows/dependency-scan.yml
// + security.yml and uploads SARIF to the Security tab. Those scanners were NOT
// mirrored locally, so a newly-published transitive CVE produced a "green
// pre-ship, red CI" code-scanning alert that the orchestrator had to remediate
// after the fact. This resolver lets pre-ship surface the same finding on the
// laptop. Prefer osv-scanner (lockfile-native, the H0 dependency gate); fall
// back to Trivy's filesystem scanner against the lockfile (dependency-focused +
// fast vs a full repo scan). Returns the argv to run, or null when neither
// binary is installed (the step SKIPs locally; CI still enforces it).
function resolveDepScanner() {
  if (!commandMissing('osv-scanner')) {
    // osv-scanner reads pnpm-lock.yaml directly and exits non-zero on a finding.
    return ['osv-scanner', '--lockfile=pnpm-lock.yaml'];
  }
  if (!commandMissing('trivy')) {
    // Mirror CI's Trivy severity filter (CRITICAL,HIGH). Scan the lockfile (not
    // the whole tree) so the run stays dependency-focused and quick.
    return [
      'trivy',
      'fs',
      '--scanners',
      'vuln',
      '--severity',
      'HIGH,CRITICAL',
      '--exit-code',
      '1',
      '--no-progress',
      'pnpm-lock.yaml',
    ];
  }
  return null;
}
const DEP_SCANNER = resolveDepScanner();

// True when running inside any CI runner (GitHub Actions sets CI=true). Used to
// flip laptop-ONLY required gates to non-required so they degrade to an honest
// SKIP instead of a gate-failing MISSING when the tool structurally can't exist
// on a CI runner (e.g. codex-review needs a local OAuth session — no API key, no
// CI equivalent). Lets `preship-full-nightly.yml` run `preship:full` against main
// without a bypass env, while every runnable gate (and the E2E matrix) still
// blocks loudly.
const IS_CI = process.env.CI === 'true' || process.env.CI === '1';

// Step plan — fail-first token gate + steps from audit doc §8, plus the
// OSV/Trivy dependency-scan parity gate (#485). Each step has:
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
    // FAIL-FIRST (2026-06-04): the very first gate. Several CI/CD/deploy jobs go
    // red only because a required token/secret/runtime-env is unset. Catch that
    // in seconds, before any test/build/coverage work — not after a ~10-min CI
    // round. Degrades to advisory when gh/vercel auth isn't available locally.
    id: 'required-tokens',
    description: 'fail-first: required tokens/secrets present (gh secrets + Vercel prod env)',
    cmd: ['node', 'scripts/check-required-tokens.mjs'],
    required: true,
  },
  {
    // COMMIT-MESSAGE GATE (2026-06-08): pre-ship previously ran NO commit-message
    // lint — its `audit` step is `pnpm audit` (dependency CVEs only). So the
    // commitlint rules CI's `system-audit` blocks on (subject must not start
    // upper-case, body lines <=100, etc.) passed locally and only reddened in CI
    // — e.g. an upper-case subject "feat(ai-worker): OpenRouter…" (#340). This
    // runs the SAME linter (tools/audit/commit_msg_lint.py) over origin/main..HEAD
    // so those are caught before push, not after a ~10-min CI round. Fast +
    // deterministic; placed near the top for fail-first feedback. SKIPs only if
    // no Python is installed (CI still gates); degrades to advisory if origin/main
    // can't be resolved locally.
    id: 'commit-msg-lint',
    description:
      'commit messages (origin/main..HEAD) pass the audit commitlint rules — same linter as CI system-audit',
    cmd: [PYTHON_BIN || 'python', 'tools/audit/commit_msg_lint.py', '--base-ref', 'origin/main'],
    skip_if: () => PYTHON_BIN === null,
    required: true,
  },
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
    // IaC formatting gate (INFRA-TF-004). Mirrors the terraform.yml `fmt -check`
    // job so drift is caught locally, not after a CI round. SKIPs if terraform
    // isn't installed; required when it is.
    id: 'terraform-fmt',
    description: 'terraform fmt -check -recursive (infra/terraform)',
    cmd: ['terraform', '-chdir=infra/terraform', 'fmt', '-check', '-recursive'],
    skip_if: () => commandMissing('terraform'),
    required: true,
  },
  {
    // GitHub Actions workflow linter. Advisory (required:false) for now: it's
    // typically not installed locally (skips), and a clean pass across the whole
    // workflow corpus hasn't been confirmed — promote to required once it has.
    id: 'actionlint',
    description: 'actionlint (.github/workflows syntax/expression lint) — advisory',
    cmd: ['actionlint'],
    skip_if: () => commandMissing('actionlint'),
    required: false,
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
    id: 'governance-schema',
    description: 'ADR-007 governance schema gate (dataClassification + policy/hold/DSAR models)',
    cmd: ['node', 'scripts/check-governance-schema.mjs'],
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
    // DOC-016: docs-integrity gate. Mirrors CI `.github/workflows/docs-integrity.yml`
    // (`GATE:docs-integrity-pass`). Fails the gate when a design doc's canonical
    // route total / tier aggregate drifts from the live filesystem audit, so a
    // route-adding PR that forgets to reconcile the docs is caught locally.
    id: 'docs-integrity',
    description: 'docs-integrity route-total consistency (design docs vs filesystem)',
    cmd: ['pnpm', 'tsx', 'tools/scripts/docs-integrity-audit.ts'],
    required: true,
  },
  {
    // ENG-OPS-002.R13 / QUAL-012: flaky-test skip gate. Fails when a
    // test.skip/it.skip/describe.skip/xit/xdescribe/xtest lacks an approved
    // ADR-054 annotation or allowlist entry (docs/architecture/adr/ADR-054-
    // property-based-race-condition-testing.md, section 6). Mirrors the CI
    // `lint` job's flaky-test-gate step.
    id: 'flaky-test-gate',
    description: 'ADR-054 flaky-test skip gate (unannotated test.skip/it.skip/describe.skip)',
    cmd: ['pnpm', 'tsx', 'tools/scripts/flaky-test-skip-gate.ts'],
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
      // Probe Docker for postgres AND redis. `docker ps --filter name=X
      // --filter name=Y` combines filters with AND, so no single container
      // can match both — that probe is permanently empty. List ALL running
      // container names once and require both substrings to appear.
      const r = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        timeout: 10000, // wedged daemon: don't hang the gate on the probe (mirrors dbStackUnavailable)
      });
      if (r.error || r.status !== 0) return true; // docker missing / daemon down / probe timed out → skip
      const names = (r.stdout || '').toLowerCase();
      const hasPostgres = names.includes('postgres');
      const hasRedis = names.includes('redis');
      return !(hasPostgres && hasRedis);
    },
    skip_remediation:
      'Start the local stack: `docker compose -f docker-compose.yml up -d postgres redis`. Then re-run, or set PRESHIP_ALLOW_MISSING=1 to bypass for this push only.',
    required: true,
  },
  {
    id: 'coverage',
    description: 'pnpm run test:coverage (merged Istanbul output)',
    cmd: ['pnpm', 'run', 'test:coverage'],
    // Needs a local test DB (the merged run includes the integration project).
    // Without one, degrade to MISSING-required rather than hard-fail against a
    // possibly-wrong/prod DB.
    skip_if: dbStackUnavailable,
    skip_remediation:
      'Start the local stack: `docker compose -f docker-compose.yml up -d postgres redis` and point DATABASE_URL at the LOCAL test DB (never prod). Then re-run, or set PRESHIP_ALLOW_MISSING=1 to acknowledge the gap for this push.',
    required: true,
  },
  {
    // Enforce the SAME ratchet floor CI enforces, via the SAME script
    // (scripts/check-coverage-floor.mjs) — so the laptop predicts CI's
    // `Merge Coverage Gate`. Note: pre-ship's test:coverage merges all 16
    // projects (a superset of CI's unit-only merge), so it's a conservative-ish
    // local predictor; CI's sharded merge remains authoritative. See ADR-058.
    id: 'coverage-floor',
    description: 'enforce CI ratchet floor (78/70/75/80) on merged coverage — shared gate',
    cmd: ['node', 'scripts/check-coverage-floor.mjs'],
    // Depends on the lcov from `coverage`; if that was skipped, skip too.
    skip_if: lcovMissing,
    skip_remediation: 'Run the `coverage` step first (needs the local test DB).',
    required: true,
  },
  {
    // Mirror SonarCloud's `new_coverage` (>=80% on the CHANGED lines) LOCALLY,
    // using the SAME merged lcov. The overall ratchet floor above barely moves
    // for a small diff, so it cannot catch an under-tested change — this step
    // can. This is the exact gap that let PR #265 pass pre-ship's coverage gate
    // while CI's `SonarCloud Scan` / new_coverage went red.
    id: 'diff-coverage',
    description: 'enforce Sonar new_coverage (>=80% on changed lines vs origin/main)',
    cmd: ['node', 'scripts/check-diff-coverage.mjs'],
    // Depends on the lcov from `coverage`; if that was skipped, skip too.
    skip_if: lcovMissing,
    skip_remediation: 'Run the `coverage` step first (needs the local test DB).',
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
    description:
      'pnpm audit --audit-level=high (advisory — CI security-scan runs with continue-on-error, so we match that)',
    cmd: ['pnpm', 'audit', '--audit-level=high'],
    // CI's ci.yml > security-scan step has `continue-on-error: true` on
    // the equivalent `pnpm audit --audit-level=high` invocation, which
    // means CI does NOT fail on a high-severity vuln from this gate.
    // Mirroring the required-check graph honestly: this step must be
    // non-required locally too, otherwise developers cannot push until
    // every existing high vuln rides through the Dependabot queue.
    required: false,
  },
  {
    // SECOND-LOCKFILE AUDIT (ENG-OPS-003.Gap6, #642): docs/ is a Docusaurus site
    // that is NOT a pnpm workspace member, so it has its own pnpm-lock.yaml that
    // the root `pnpm.overrides` and the `audit` step above BOTH miss. That blind
    // spot let a CRITICAL (websocket-driver, CVE-2026-54466) sit there since
    // 2026-07-16, visible only as a Trivy code-scanning alert.
    //
    // `--ignore-workspace` is REQUIRED: without it pnpm walks up, finds the root
    // pnpm-workspace.yaml and audits the root project instead — reporting clean
    // while docs/ is vulnerable. Note also that `pnpm audit` here is only
    // meaningful once docs/ deps are installed; on an uninstalled docs/ it
    // reports "No known vulnerabilities found" vacuously.
    id: 'docs-audit',
    description:
      'pnpm audit --audit-level=high in docs/ (second lockfile, outside the root workspace)',
    cmd: ['pnpm', 'audit', '--audit-level=high', '--ignore-workspace'],
    cwd: path.join(REPO_ROOT, 'docs'),
    // Advisory, mirroring the root `audit` step's required:false so the two
    // lockfiles are gated consistently.
    required: false,
  },
  {
    // OSV / TRIVY PARITY GATE (2026-06-15, #485): mirror CI's dependency-scan +
    // security workflows (osv-scanner + Trivy `fs`) LOCALLY so a newly-published
    // transitive CVE surfaces here instead of as a post-merge code-scanning alert
    // the orchestrator has to chase ("green pre-ship, red CI"). `pnpm audit`
    // above queries npm's advisory DB; this adds the OSV.dev / Trivy DB the CI
    // SARIF scanners use, which can diverge (different advisory sources/timing).
    //
    // Advisory (required:false) to mirror CI honestly: the dependency-scan jobs
    // upload SARIF but do NOT block the merge (continue-on-error / report-only),
    // so a HIGH/CRITICAL finding here REPORTS loudly without wedging every push
    // behind the Dependabot queue. SKIPs (not blocks) when no scanner binary is
    // installed; CI still enforces it.
    id: 'osv-scan',
    description:
      'OSV/Trivy dependency CVE scan vs pnpm-lock.yaml — advisory, mirrors CI dependency-scan (#485)',
    cmd: DEP_SCANNER || ['node', '-e', 'process.exit(0)'],
    skip_if: () => DEP_SCANNER === null,
    skip_remediation:
      'Install a dependency CVE scanner so new transitive CVEs surface locally: ' +
      'osv-scanner (https://github.com/google/osv-scanner) or Trivy ' +
      '(https://github.com/aquasecurity/trivy). CI still enforces this scan.',
    required: false,
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
    // WORKFLOW-YAML SECRET LINT (Harness hardening — Gap #1): parses every
    // .github/workflows/*.yml and BLOCKS a hardcoded credential literal
    // (POSTGRES_PASSWORD / DATABASE_URL / DIRECT_URL / PGPASSWORD / password /
    // pw) that isn't a `${{ secrets.* }}` reference, a self-evident placeholder
    // (stub/…), or a consciously-annotated `# secret-lint-allow: <reason>`
    // throwaway. The `gitleaks` step above (and its default ruleset) has no rule
    // for a bare `postgres:postgres` literal, so those passed the laptop gate and
    // only reddened on GitGuardian in the cloud — three times (#622, #625, #627).
    // This is the LOCAL parity gate for that class. No infra, fast, deterministic
    // → required (unlike the optional/advisory scanners above, which skip when a
    // binary is absent or mirror CI's continue-on-error jobs).
    id: 'workflow-secret-lint',
    description:
      'workflow-YAML secret linter — no hardcoded credential literals in .github/workflows (GitGuardian parity, Gap #1)',
    cmd: ['node', 'tools/scripts/security/workflow-secret-lint.mjs'],
    required: true,
  },
  {
    id: 'architecture',
    description: 'tests/architecture (hexagonal boundary checks — required to mirror CI)',
    cmd: ['pnpm', 'test'],
    cwd: path.join(REPO_ROOT, 'tests/architecture'),
    // CI's ci.yml > Architecture Tests job runs `pnpm test` in this
    // directory and FAILS the job on test failure. Only the upstream
    // `pnpm install` step has continue-on-error, not the test step. To
    // mirror CI's required-check graph honestly, this step must be
    // required locally too.
    required: true,
  },
  {
    id: 'validate-sprint-data',
    description: 'sprint data validator',
    cmd: ['pnpm', 'run', 'validate:sprint-data'],
    required: true,
  },
  {
    // SEMANTIC REVIEW GATE (2026-06-11): drives an independent Codex review
    // of the diff vs origin/main, flagging correctness / data-integrity /
    // security bugs that pass TypeScript + tests + lint because the author's
    // own tests encode the same wrong assumption (e.g. revenue-band "1M-10M"
    // mapped to 100 cents with green tests). Block on ANY unwaived finding.
    //
    // LOCAL-ONLY enforcement: the codex CLI must be installed and OAuth-
    // authenticated (ChatGPT/Codex login). No API key is required or used.
    // Degrades to SKIPPED_PRECONDITION when codex is absent or not logged in
    // (mirrors the actionlint / semgrep degrade pattern).
    // There is NO CI enforcement — this gate is pre-push only.
    id: 'codex-review',
    description:
      'Codex semantic review (OAuth, local-only): correctness/data-integrity/security bugs in diff',
    cmd: ['node', 'scripts/codex-review.mjs'],
    skip_if: () => {
      // The gate falls back to the Claude Code CLI when codex is missing/unauthed
      // or hits its usage/tier cap, so whenever `claude` is present the step MUST
      // run (codex-review.mjs handles the codex→claude selection internally).
      if (!commandMissing('claude')) return false;
      // No claude fallback available — require an authed codex, else skip.
      if (commandMissing('codex')) return true;
      // Auth probe: codex login status exits 0 and prints "Logged in" when authed.
      // No OPENAI_API_KEY check — gate uses local OAuth session only.
      const r = spawnSync('codex', ['login', 'status'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        timeout: 10_000,
      });
      if (r.error || r.status !== 0) return true;
      // CLI writes "Logged in using ChatGPT" to stderr in codex 0.133.x.
      // Check both streams for forward-compatibility.
      const combined = ((r.stdout || '') + (r.stderr || '')).toLowerCase();
      return !combined.includes('logged in');
    },
    skip_remediation:
      'Install codex CLI (`npm i -g @openai/codex`) and authenticate: `codex login`, ' +
      'OR have the Claude Code CLI (`claude`) on PATH as a fallback reviewer. ' +
      'Confirm codex with `codex login status` (uses local OAuth, no API key).',
    // Pre-push-only gate: its own design has "There is NO CI enforcement" (above).
    // codex-review needs a local OAuth session that cannot exist on a CI runner, so
    // under CI it degrades to an honest SKIP rather than a gate-failing MISSING —
    // this is the faithful encoding of that docstring, not a bypass. Required as
    // ever on a developer laptop.
    required: !IS_CI,
  },
  {
    // FULL CROSS-BROWSER E2E (Gap #4, 2026-07-24): opt-in matrix run. Only executes
    // when `--full` (or PRESHIP_MODE=full) is passed — the default push gate stays
    // single-browser (smoke/chromium) to keep the PR gate under ~45 min. Runs the
    // three desktop engines so a regression that only reproduces on Gecko (firefox)
    // or WebKit (Safari) is caught BEFORE it reaches the nightly cross-browser CI
    // job. firefox/webkit discover the same UNAUTH_SPECS as chromium (see
    // playwright.config.ts) so this is a true apples-to-apples cross-browser check.
    // Heavy (~2h with the standard gate); scheduled nightly via
    // preship-full-nightly.yml. Playwright exits non-zero on "No tests found", so a
    // discovery regression fails this step LOUD rather than passing on zero signal.
    id: 'e2e-full-matrix',
    description:
      'FULL cross-browser E2E — Playwright chromium+firefox+webkit (opt-in --full; nightly)',
    cmd: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--project=chromium',
      '--project=firefox',
      '--project=webkit',
    ],
    // Only runs in --full mode; harmlessly skipped (SKIPPED_NOT_FULL) otherwise.
    full_only: true,
    required: true,
  },
];

const args = process.argv.slice(2);
const KNOWN_FLAGS = new Set(['--clean', '--list', '--full', '--help']);
const KNOWN_PREFIXES = ['--only='];
const flags = {
  clean: args.includes('--clean'),
  list: args.includes('--list'),
  help: args.includes('--help'),
  // `--full` flag OR `PRESHIP_MODE=full` env — either opts into the cross-browser
  // E2E matrix (steps marked full_only). The default (neither set) is the
  // single-browser standard gate.
  full: args.includes('--full') || process.env.PRESHIP_MODE === 'full',
  only: null,
};
for (const a of args) {
  if (a.startsWith('--only=')) {
    flags.only = a.slice('--only='.length).split(',');
    continue;
  }
  if (KNOWN_FLAGS.has(a)) continue;
  if (KNOWN_PREFIXES.some((p) => a.startsWith(p))) continue;
  // Unknown flag — fail with documented exit code 2 instead of silently
  // ignoring (which previously made typos like `--cleen` look like a
  // successful full run).
  process.stderr.write(`pre-ship: unknown argument '${a}'.\n`);
  process.stderr.write(`Known flags: --clean, --list, --full, --help, --only=<id,id,...>\n`);
  process.exit(2);
}

if (flags.help) {
  process.stdout.write(
    [
      'pre-ship — local gate mirroring CI required checks.',
      '',
      'Usage: node scripts/pre-ship.mjs [--full] [--clean] [--only=<id,id,...>]',
      '',
      'Modes:',
      '  (default)   standard gate — single-browser E2E (smoke/chromium). Push default.',
      '  --full      standard gate PLUS full cross-browser E2E matrix',
      '              (chromium+firefox+webkit). Opt-in, ~2h; nightly / pre-release.',
      '              Equivalent: PRESHIP_MODE=full. Docs: docs/dev/preship-full.md',
      '',
      'Flags:',
      '  --clean     force re-run all steps (ignore the cached-PASS state)',
      '  --list      print the step plan and exit',
      '  --help      print this help and exit',
      '  --only=IDS  run only the comma-separated step ids',
      '',
      'Env: PRESHIP_MODE=full · PRESHIP_KEEP_GOING=1 · PRESHIP_ALLOW_MISSING=1',
      '',
    ].join('\n')
  );
  process.exit(0);
}

if (flags.list) {
  process.stdout.write(`pre-ship step plan (mode: ${flags.full ? 'full' : 'standard'})\n`);
  for (const s of STEPS) {
    // full_only steps only run under --full; tag them so `--list` (standard) makes
    // the extra matrix step visibly opt-in rather than looking always-on.
    const tag = s.full_only ? ' [--full only]' : '';
    console.log(`  ${s.id.padEnd(28)}  ${s.description}${tag}`);
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

  // full_only steps (the cross-browser E2E matrix) run ONLY under --full /
  // PRESHIP_MODE=full. Outside full mode they are an honest skip — never a
  // MISSING/FAIL — so the default push gate stays single-browser and fast.
  if (step.full_only && !flags.full) {
    return { id: step.id, verdict: 'SKIPPED_NOT_FULL', duration_ms: 0 };
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
    // Display 0ms for cached results so the printed timing isn't
    // mistaken for a fresh run that took the old duration. Keep the
    // original duration in a separate field for audit if needed.
    return {
      ...cached,
      verdict: 'CACHED_PASS',
      duration_ms: 0,
      cached_original_duration_ms: cached.duration_ms,
    };
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
    // Default 1MB maxBuffer is blown by noisy steps (unit-tests emits
    // ~14k lines / >5MB of AUDIT + RBAC log lines). When exceeded,
    // spawnSync kills the child with SIGTERM and returns status=null,
    // giving the false impression that the test failed when it was
    // really truncated. 256MB is comfortably above any current step.
    maxBuffer: 256 * 1024 * 1024,
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
      SKIPPED_NOT_FULL: '-',
      NOT_RUN: ' ',
      MISSING: '!',
    }[v] || '?'
  );
}

// Verdict for a slice of results (standard-only or full-only), honouring the
// PRESHIP_ALLOW_MISSING acknowledgement. A required FAIL or an unacknowledged
// MISSING-required makes the slice FAIL. Used to print the standard-gate and
// full-matrix-E2E verdicts as SEPARATE lines under --full.
function sliceVerdict(list, allowMissing) {
  const fails = list.filter((r) => r.verdict === 'FAIL' && r.required !== false);
  const missing = allowMissing ? [] : list.filter(isMissingRequired);
  return { fails, missing, verdict: fails.length === 0 && missing.length === 0 ? 'PASS' : 'FAIL' };
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

  process.stdout.write(
    `pre-ship: mode ${flags.full ? 'FULL (standard gate + cross-browser E2E)' : 'standard'}.\n\n`
  );

  const results = [];
  const totalStart = Date.now();
  let aborted = false;
  let boundaryPrinted = false;

  const allowMissing = process.env.PRESHIP_ALLOW_MISSING === '1';

  for (const step of STEPS) {
    // Standard → full-matrix boundary (only meaningful under --full). The E2E
    // matrix is the only full_only step and it comes last, so the first full_only
    // step marks the end of the standard gate: print that gate's verdict on its
    // OWN line, then start the E2E phase — the clear standard/full log separation.
    if (step.full_only && !boundaryPrinted && flags.full) {
      boundaryPrinted = true;
      const std = sliceVerdict(results, allowMissing);
      process.stdout.write(
        `\n  ── standard gate ${std.verdict} ${'─'.repeat(Math.max(2, 40 - std.verdict.length))}\n`
      );
      process.stdout.write(`  ── full-matrix E2E (chromium+firefox+webkit) ──────\n`);
      // Don't spend ~2h on the cross-browser matrix when the standard gate is
      // already red — the developer must fix that first regardless.
      if (std.verdict !== 'PASS' && !aborted) {
        aborted = true;
        process.stdout.write(`  (skipping full-matrix E2E — standard gate is not green.)\n`);
      }
    }

    if (aborted) {
      // full_only step skipped-because-not-full is an HONEST skip, not a suppressed
      // run; label it accordingly so a standard run's state file reads correctly.
      const skippedVerdict = step.full_only && !flags.full ? 'SKIPPED_NOT_FULL' : 'NOT_RUN';
      results.push({ id: step.id, verdict: skippedVerdict, duration_ms: 0 });
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
  // Under --full, report the two phases as SEPARATE verdict lines so a green
  // standard gate + red cross-browser matrix (or vice-versa) is unambiguous.
  if (flags.full) {
    const fullIds = new Set(STEPS.filter((s) => s.full_only).map((s) => s.id));
    const stdResults = results.filter((r) => !fullIds.has(r.id));
    const fullResults = results.filter((r) => fullIds.has(r.id));
    const stdV = sliceVerdict(stdResults, allowMissing).verdict;
    // A full-matrix step left NOT_RUN (standard gate was red) must not read as a
    // spurious PASS — surface it as NOT RUN so the log is honest.
    const fullRan = fullResults.some((r) => r.verdict === 'PASS' || r.verdict === 'FAIL');
    const fullV = fullRan ? sliceVerdict(fullResults, allowMissing).verdict : 'NOT RUN';
    process.stdout.write(`pre-ship: standard gate ${stdV}.\n`);
    process.stdout.write(`pre-ship: full-matrix E2E ${fullV}.\n`);
  }
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
