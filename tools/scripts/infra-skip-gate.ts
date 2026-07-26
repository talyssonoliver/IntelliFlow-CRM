/**
 * Runtime silent-skip gate (issue #658 — ADR-054 section 9 enforcement).
 *
 * THE PROBLEM. An infra-gated suite that skips every one of its tests reports
 * GREEN having executed nothing. `tests/integration/ingestion/file-ingestion.e2e.test.ts`
 * sat in that state for months; when ENG-OPS-003.Gap9 forced it to actually run it
 * immediately surfaced EIGHT real failures, one of them a production defect
 * (`documents.upload` returned 500 for every cuid-issued tenant). A suite that
 * silently skips is worse than no suite: it reports green AND suppresses the signal.
 *
 * WHY THE EXISTING GATE DOESN'T COVER THIS. `tools/scripts/flaky-test-skip-gate.ts`
 * is a STATIC/AST gate. Its docblock deliberately exempts exactly this shape —
 * `cond ? describe : describe.skip`, `describe.skipIf(...)`, and runtime `ctx.skip()`
 * — because whether such a gate actually skipped is a RUNTIME fact, unknowable from
 * the AST. That exemption is correct for a static gate. This module supplies the
 * runtime half: the static gate governs whether a skip is EXPLAINED; this one
 * governs whether a skip is DISCLOSED.
 *
 * WHAT IT READS. The per-project Vitest JSON already emitted by
 * `scripts/run-coverage.js` into `artifacts/coverage-parts/<project>/vitest-result.json`
 * (it has run `--reporter=json` since long before this gate existed). No custom
 * Vitest reporter is needed.
 *
 * FRESHNESS IS LOAD-BEARING. `run-coverage.js` only wipes `coverage-parts/` when it
 * actually runs, so a Docker-down push can leave last week's manifests on disk. A
 * gate that reconciled against those would report PASS with no run behind it — the
 * very silence-as-success bug this module exists to kill. So every run is validated
 * against `artifacts/coverage-parts/RUN_ID.json` (`{headSha, startedAt}`) and an
 * unverifiable manifest degrades to UNVERIFIABLE (honest MISSING), never to PASS.
 *
 * RULES (binary — no WARN, per repo doctrine):
 *   R1  collected > 0 && executed === 0 && not declared        -> violation
 *   R2  skipped > entry.maxSkipped                             -> violation
 *   R3  now() > entry.reviewBy                                 -> violation
 *   R4  entry.reason fails the ADR-054 reference grammar       -> violation
 *   R5  entry.file no longer exists on disk                    -> violation
 *
 * DELIBERATELY NOT A RULE: "a declared suite now executes fully -> violation".
 * The skip set is ENVIRONMENT-DEPENDENT — the same registry is evaluated on a
 * laptop, in PR CI, and in preship-full-nightly. `file-ingestion` legitimately runs
 * FULLY in the nightly, which is where it is supposed to run; failing there would
 * make the gate unsatisfiable. `maxSkipped` is therefore a CEILING: running more
 * tests than declared is always an improvement and never fails. R3's date-based
 * expiry supplies the burn-down pressure that such a rule was meant to provide.
 *
 * Verify: `pnpm tsx tools/scripts/infra-skip-gate.ts`
 *
 * @module tools/scripts/infra-skip-gate
 */

import { readFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { findRepoRoot } from './lib/validation-utils.js';

// ============================================================================
// Constants
// ============================================================================

/** Where `scripts/run-coverage.js` writes its per-project JSON. */
export const PARTS_DIR = 'artifacts/coverage-parts';

/** Freshness marker written by `scripts/run-coverage.js` at the start of a real run. */
export const RUN_ID_FILE = 'RUN_ID.json';

/** Per-project result filename inside each `PARTS_DIR/<project>/`. */
export const RESULT_FILE = 'vitest-result.json';

export const REGISTRY_PATH = 'tools/scripts/infra-skip-gate.registry.json';

/** Test-file suffixes this gate judges. Mirrors flaky-test-skip-gate.ts. */
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

/**
 * Accepted `kind` values. A closed enum on purpose: forcing a nightly-only suite to
 * claim "infra-gated" would be a DISHONEST reason, which is worse than a missing one
 * because it looks solved.
 */
export const VALID_KINDS = new Set([
  'infra-gated',
  'nightly-only',
  'ci-inverse',
  'pending-deletion',
]);

/**
 * Same reference grammar as ADR-054 inline annotations
 * (`tools/scripts/flaky-test-skip-gate.ts` ANNOTATION_PATTERN): a GitHub issue, the
 * literal DEFERRED, a task ID, or a finding ID. Deliberately not "any text" — a
 * reason with no concrete reference is decoration, not evidence.
 */
export const REASON_PATTERN =
  /ADR-054:\s*(#\d+|DEFERRED\b|ENG-OPS-\d{3}\.[A-Za-z0-9.]+|[A-Z][A-Z0-9]{1,20}(-[A-Z0-9]{1,20}){1,4})/;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ============================================================================
// Types
// ============================================================================

export interface RegistryEntry {
  /** Repo-relative, forward-slash path of the test file. */
  file: string;
  kind: string;
  /** Ceiling, not an expected value. `skipped` above this is a violation. */
  maxSkipped: number;
  /** ISO `YYYY-MM-DD`. Past this date the entry fails (R3). */
  reviewBy: string;
  /** Must satisfy REASON_PATTERN. */
  reason: string;
}

export interface FileSummary {
  file: string;
  collected: number;
  executed: number;
  skipped: number;
  /** Which project's manifest this came from (for reporting). */
  project: string;
}

export type ViolationRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

export interface Violation {
  rule: ViolationRule;
  file: string;
  message: string;
}

export type ManifestStatus = 'ok' | 'unverifiable';

export interface ManifestLoad {
  status: ManifestStatus;
  /** Why it is unverifiable (absent marker, HEAD mismatch, no manifests). */
  reason?: string;
  files: FileSummary[];
}

export interface GateResult {
  status: ManifestStatus;
  unverifiableReason?: string;
  summaries: FileSummary[];
  /** Files that collected tests but executed none. */
  silent: FileSummary[];
  declared: RegistryEntry[];
  violations: Violation[];
  ok: boolean;
  elapsedMs: number;
}

export interface RunOptions {
  /** Injectable manifest source so tests never run a real Vitest suite. */
  loadResults?: (repoRoot: string) => ManifestLoad;
  loadRegistry?: (repoRoot: string) => RegistryEntry[];
  /** Injectable existence check for R5. */
  fileExists?: (repoRoot: string, relPath: string) => boolean;
  now?: () => number;
}

// ============================================================================
// Pure logic
// ============================================================================

/** Normalize an absolute test path to a repo-relative, forward-slash path. */
export function toRepoRelative(repoRoot: string, absPath: string): string {
  const norm = absPath.replace(/\\/g, '/');
  const root = repoRoot.replace(/\\/g, '/').replace(/\/$/, '');
  return norm.startsWith(root + '/') ? norm.slice(root.length + 1) : norm;
}

/**
 * Roll a Vitest `testResults[]` entry up into executed/skipped counts.
 * `passed`/`failed` executed; `skipped`/`todo`/`disabled` did not.
 */
export function summarizeFile(
  file: string,
  assertionResults: Array<{ status?: string }>,
  project: string
): FileSummary {
  let executed = 0;
  let skipped = 0;
  for (const a of assertionResults) {
    if (a.status === 'passed' || a.status === 'failed') executed++;
    else skipped++;
  }
  return { file, collected: assertionResults.length, executed, skipped, project };
}

/**
 * A file is "silently skipping" when it collected tests but ran none.
 *
 * `collected === 0` is EXCLUDED on purpose: `passWithNoTests: true`
 * (`vitest.config.ts`) makes genuinely-empty projects legitimate, and a file that
 * collected nothing because it failed to import already fails loudly on its own.
 */
export function isSilent(s: FileSummary): boolean {
  return s.collected > 0 && s.executed === 0;
}

/** Structural + policy validation of one registry entry (R3, R4, R5 inputs). */
export function validateEntry(
  entry: RegistryEntry,
  opts: { now: number; exists: (relPath: string) => boolean }
): Violation[] {
  const out: Violation[] = [];
  const file = entry.file ?? '(missing file field)';

  if (!entry.file || typeof entry.file !== 'string') {
    out.push({ rule: 'R4', file, message: 'entry is missing a string `file`' });
    return out;
  }
  if (!VALID_KINDS.has(entry.kind)) {
    out.push({
      rule: 'R4',
      file,
      message: `invalid kind "${entry.kind}" (expected one of: ${[...VALID_KINDS].join(', ')})`,
    });
  }
  if (typeof entry.maxSkipped !== 'number' || entry.maxSkipped < 0) {
    out.push({ rule: 'R4', file, message: '`maxSkipped` must be a non-negative number' });
  }
  if (typeof entry.reason !== 'string' || !REASON_PATTERN.test(entry.reason)) {
    out.push({
      rule: 'R4',
      file,
      message:
        '`reason` must carry a concrete ADR-054 reference ' +
        '(e.g. "ADR-054: #658 — ..."); a reason with no reference is decoration, not evidence',
    });
  }
  if (typeof entry.reviewBy !== 'string' || !ISO_DATE_PATTERN.test(entry.reviewBy)) {
    out.push({ rule: 'R4', file, message: '`reviewBy` must be an ISO date (YYYY-MM-DD)' });
  } else {
    // R3 — burn-down. Compare at end-of-day UTC so the entry is valid THROUGH reviewBy.
    const due = Date.parse(`${entry.reviewBy}T23:59:59Z`);
    if (Number.isFinite(due) && opts.now > due) {
      out.push({
        rule: 'R3',
        file,
        message: `declaration expired on ${entry.reviewBy} — re-justify with a new reviewBy, or remove it if the suite now runs`,
      });
    }
  }
  // R5 — prune dead entries.
  if (entry.file && !opts.exists(entry.file)) {
    out.push({ rule: 'R5', file, message: 'declared file no longer exists — remove this entry' });
  }
  return out;
}

/** Apply R1 and R2 across the measured summaries given the declarations. */
export function reconcile(
  summaries: FileSummary[],
  registry: RegistryEntry[]
): { silent: FileSummary[]; violations: Violation[] } {
  const byFile = new Map(registry.map((e) => [e.file, e]));
  const silent: FileSummary[] = [];
  const violations: Violation[] = [];

  for (const s of summaries) {
    if (!TEST_FILE_PATTERN.test(s.file)) continue;
    const entry = byFile.get(s.file);

    if (isSilent(s)) {
      silent.push(s);
      if (!entry) {
        violations.push({
          rule: 'R1',
          file: s.file,
          message: `collected ${s.collected} test(s) but executed 0 — silently green. Declare it in ${REGISTRY_PATH} or make it run.`,
        });
        continue;
      }
    }

    // R2 applies to any declared file, silent or not: the ceiling must hold.
    // Running MORE than declared is an improvement and never fails (see docblock).
    if (entry && typeof entry.maxSkipped === 'number' && s.skipped > entry.maxSkipped) {
      violations.push({
        rule: 'R2',
        file: s.file,
        message: `skipped ${s.skipped} test(s), above the declared ceiling of ${entry.maxSkipped}. A new test is skipping that the declaration never covered.`,
      });
    }
  }
  return { silent, violations };
}

// ============================================================================
// I/O (all injectable)
// ============================================================================

function currentHeadSha(repoRoot: string): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Load every per-project manifest, but ONLY after proving it belongs to the current
 * commit. Fails closed: anything unverifiable degrades to `unverifiable`, which the
 * caller reports as MISSING rather than PASS.
 */
/**
 * Prove the manifest set belongs to the current commit. Returns null when it does,
 * or the reason it cannot be trusted.
 */
function verifyRunMarker(
  repoRoot: string,
  partsAbs: string,
  getHead: (repoRoot: string) => string | null
): string | null {
  const markerAbs = join(partsAbs, RUN_ID_FILE);
  if (!existsSync(markerAbs)) {
    return `no ${PARTS_DIR}/${RUN_ID_FILE} — the coverage run did not happen (or predates this gate)`;
  }

  let marker: { headSha?: string };
  try {
    marker = JSON.parse(readFileSync(markerAbs, 'utf-8'));
  } catch {
    return `${RUN_ID_FILE} is unreadable`;
  }

  const head = getHead(repoRoot);
  if (!head || !marker.headSha || marker.headSha !== head) {
    const wrote = marker.headSha ?? 'an unknown commit';
    return `${RUN_ID_FILE} was written for ${wrote}, current HEAD is ${head ?? 'unknown'} — refusing to reconcile against a stale run`;
  }
  return null;
}

/** Summarize one project's `vitest-result.json`. Throws if the file is unparseable. */
function readProjectManifest(repoRoot: string, resultAbs: string, project: string): FileSummary[] {
  const parsed = JSON.parse(readFileSync(resultAbs, 'utf-8'));
  const out: FileSummary[] = [];
  for (const r of parsed.testResults ?? []) {
    if (typeof r?.name !== 'string') continue;
    const assertions = Array.isArray(r.assertionResults) ? r.assertionResults : [];
    out.push(summarizeFile(toRepoRelative(repoRoot, r.name), assertions, project));
  }
  return out;
}

export function loadResults(
  repoRoot: string,
  getHead: (repoRoot: string) => string | null = currentHeadSha
): ManifestLoad {
  const partsAbs = resolve(repoRoot, PARTS_DIR);

  const untrustworthy = verifyRunMarker(repoRoot, partsAbs, getHead);
  if (untrustworthy) return { status: 'unverifiable', reason: untrustworthy, files: [] };

  const files: FileSummary[] = [];
  for (const project of readdirSync(partsAbs, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const resultAbs = join(partsAbs, project.name, RESULT_FILE);
    if (!existsSync(resultAbs)) continue;
    try {
      files.push(...readProjectManifest(repoRoot, resultAbs, project.name));
    } catch {
      // A single corrupt project manifest must not silently shrink the audited set.
      return {
        status: 'unverifiable',
        reason: `${PARTS_DIR}/${project.name}/${RESULT_FILE} is corrupt`,
        files: [],
      };
    }
  }

  if (files.length === 0) {
    return { status: 'unverifiable', reason: 'no per-project manifests found', files: [] };
  }
  return { status: 'ok', files };
}

export function loadRegistry(repoRoot: string): RegistryEntry[] {
  const absPath = resolve(repoRoot, REGISTRY_PATH);
  if (!existsSync(absPath)) return [];
  try {
    let raw = readFileSync(absPath, 'utf-8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray((parsed as { entries?: unknown })?.entries)
      ? (parsed as { entries: unknown[] }).entries
      : [];
    return entries.filter((e): e is RegistryEntry => !!e && typeof e === 'object');
  } catch {
    return [];
  }
}

function defaultFileExists(repoRoot: string, relPath: string): boolean {
  return existsSync(resolve(repoRoot, relPath));
}

// ============================================================================
// Runner
// ============================================================================

export function runInfraSkipGate(repoRoot: string, opts: RunOptions = {}): GateResult {
  const loadResultsFn = opts.loadResults ?? loadResults;
  const loadRegistryFn = opts.loadRegistry ?? loadRegistry;
  const fileExists = opts.fileExists ?? defaultFileExists;
  const now = opts.now ?? (() => Date.now());
  const start = now();

  const registry = loadRegistryFn(repoRoot);
  const manifest = loadResultsFn(repoRoot);

  // Registry hygiene (R3/R4/R5) is checked even when no run is available: a
  // grammar-invalid or expired declaration is wrong regardless of today's results.
  const violations: Violation[] = [];
  for (const entry of registry) {
    violations.push(
      ...validateEntry(entry, { now: start, exists: (p) => fileExists(repoRoot, p) })
    );
  }

  if (manifest.status === 'unverifiable') {
    return {
      status: 'unverifiable',
      unverifiableReason: manifest.reason,
      summaries: [],
      silent: [],
      declared: registry,
      violations,
      // NEVER ok. An unverifiable run must not report PASS — that is the exact
      // silence-as-success failure this gate exists to catch, and it would be
      // absurd to reproduce it here. Callers that legitimately have no run (Docker
      // down) are expected to not invoke the gate at all: pre-ship's `skip_if`
      // pre-validates the marker and degrades the step to an honest MISSING. If we
      // are running despite an unverifiable manifest, something is wrong and it
      // must be loud.
      ok: false,
      elapsedMs: now() - start,
    };
  }

  const { silent, violations: runViolations } = reconcile(manifest.files, registry);
  violations.push(...runViolations);

  return {
    status: 'ok',
    summaries: manifest.files,
    silent,
    declared: registry,
    violations,
    ok: violations.length === 0,
    elapsedMs: now() - start,
  };
}

// ============================================================================
// Reporting
// ============================================================================

/** How a fully-skipped suite is labelled in the report. */
function declarationTag(result: GateResult, file: string): string {
  const declared = result.declared.find((e) => e.file === file);
  if (!declared) return 'UNDECLARED';
  return `declared (${declared.kind}, review by ${declared.reviewBy})`;
}

function violationLines(violations: Violation[]): string[] {
  return violations.flatMap((v) => [`  • [${v.rule}] ${v.file}`, `      ${v.message}`]);
}

function remediationLines(): string[] {
  return [
    '',
    'A suite that skips every test reports GREEN having run nothing — that is how',
    'eight real defects (one a production 500) hid behind file-ingestion for months.',
    'Fix the infrastructure so the suite runs, or declare it explicitly in',
    `  ${REGISTRY_PATH}`,
    'with a `kind`, a `maxSkipped` ceiling, a `reviewBy` date, and a `reason`',
    'carrying a concrete reference (e.g. "ADR-054: #658 — needs Supabase buckets").',
    'See ADR-054 section 9 "Runtime silent-skip visibility".',
  ];
}

function verdictLines(result: GateResult): string[] {
  if (result.status === 'unverifiable') {
    const lines = ['✗ FAIL — refusing to report a verdict without a run to back it.'];
    if (result.violations.length > 0) {
      lines.push('', 'The registry also has problems that stand regardless of any run:');
      lines.push(...violationLines(result.violations));
    }
    return lines;
  }
  if (result.violations.length === 0) {
    return ['✓ PASS — no undeclared silent skip, and every declaration is in date and bounded.'];
  }
  return [
    `✗ FAIL — ${result.violations.length} violation(s):`,
    ...violationLines(result.violations),
    ...remediationLines(),
  ];
}

export function formatReport(result: GateResult): string {
  const lines: string[] = ['Runtime Silent-Skip Gate (#658 — ADR-054 section 9)', '─'.repeat(72)];

  if (result.status === 'unverifiable') {
    lines.push(
      `⏭  NO VERIFIED RUN — ${result.unverifiableReason}`,
      '',
      '   Not a pass and not a failure: there is no trustworthy run to audit.',
      '   Run `pnpm run test:coverage` (needs the local test DB) and re-run.'
    );
  } else {
    lines.push(
      `Test files audited: ${result.summaries.length}`,
      `Fully-skipped (executed 0 of N): ${result.silent.length}`,
      `Declared in registry: ${result.declared.length}`
    );
  }
  lines.push('');

  if (result.silent.length > 0) {
    lines.push('Suites that executed nothing:');
    for (const s of result.silent) {
      const tag = declarationTag(result, s.file);
      lines.push(`  • ${s.file} — ${s.skipped}/${s.collected} skipped [${tag}]`);
    }
    lines.push('');
  }

  lines.push(...verdictLines(result), '', `Completed in ${result.elapsedMs}ms.`);
  return lines.join('\n');
}

/** Emit a GitHub job-summary table so a skip is visible even on a passing run. */
export function formatJobSummary(result: GateResult): string {
  const lines: string[] = ['### Runtime silent-skip gate', ''];
  if (result.status === 'unverifiable') {
    lines.push(`No verified run to audit — ${result.unverifiableReason}`);
    return lines.join('\n');
  }
  if (result.silent.length === 0) {
    lines.push('No suite executed zero tests. ✓');
  } else {
    lines.push('| Suite | Skipped / Collected | Status |');
    lines.push('| --- | --- | --- |');
    for (const s of result.silent) {
      const d = result.declared.find((e) => e.file === s.file);
      const status = d ? `declared (${d.kind}), review by ${d.reviewBy}` : '**UNDECLARED**';
      lines.push(`| \`${s.file}\` | ${s.skipped} / ${s.collected} | ${status} |`);
    }
  }
  if (result.violations.length > 0) {
    lines.push('', `**${result.violations.length} violation(s):**`, '');
    for (const v of result.violations) lines.push(`- \`${v.rule}\` \`${v.file}\` — ${v.message}`);
  }
  return lines.join('\n');
}

// ============================================================================
// CLI
// ============================================================================

/** Runs the gate and returns a process exit code (0 pass / 1 violations). Testable. */
export function main(repoRoot: string = findRepoRoot(), opts: RunOptions = {}): number {
  const result = runInfraSkipGate(repoRoot, opts);
  const report = formatReport(result);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      appendFileSync(summaryPath, formatJobSummary(result) + '\n');
    } catch {
      // A summary-write failure must never change the gate's verdict.
    }
  }

  if (result.ok) {
    console.log(report);
    return 0;
  }
  console.error(report);
  return 1;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('infra-skip-gate.ts')
) {
  process.exit(main());
}
