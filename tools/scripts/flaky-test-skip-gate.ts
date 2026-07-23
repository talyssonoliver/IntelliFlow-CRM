/**
 * Flaky-test skip lint gate (ENG-OPS-002.R13 / QUAL-012 — ADR-054 enforcement).
 *
 * ADR-054 (`docs/architecture/adr/ADR-054-property-based-race-condition-testing.md`,
 * section 6, "Flaky-test policy") requires that `test.skip`/`it.skip`/`describe.skip`
 * (and Jest-style `xit`/`xdescribe`/`xtest`) carry a linked issue/finding reference.
 * QUAL-012 found that this was asserted in prose but never actually enforced — there
 * was no gate that failed a PR for an unexplained skip. This module is that gate.
 *
 * What counts as a "flaky/bug skip" (the thing ADR-054 regulates):
 *   - A call whose callee resolves to Vitest's `test`/`it`/`describe` (or the
 *     `@fast-check/vitest` re-exports of the same names, including via import
 *     alias, e.g. `import { test as vitestTest } from 'vitest'`), with property
 *     `.skip` or `.todo`, where the LAST argument is a function — i.e. the
 *     declarative "disable this test/suite definition" form:
 *     `it.skip('name', () => { ... })`.
 *   - Bare Jest-style `xit(...)`, `xdescribe(...)`, `xtest(...)` calls with a
 *     function argument.
 *
 * What is deliberately NOT flagged (a different, already-accepted pattern):
 *   - Playwright's imperative runtime skip, `test.skip()` / `test.skip(condition)`
 *     / `test.skip(condition, reason)` — the last argument there is never a
 *     function (it's a boolean/string), so the "last argument is a function"
 *     heuristic naturally excludes it. This form already carries a human-readable
 *     reason and is how `tests/e2e/**` gates on env flags like `E2E_AUTH_ENABLED`.
 *   - Vitest's runtime `ctx.skip()` (zero-arg) used inside a test body for the
 *     same purpose.
 *   - `describe.skipIf(cond)(...)` / `const d = cond ? describe : describe.skip`
 *     conditional-gating idioms used throughout `tests/integration/**` to skip
 *     whole suites when Docker/Redis/DB infra isn't available locally. These use
 *     `.skipIf` (a different property name) or reference `describe.skip` as a
 *     value rather than calling it, so they don't match the AST shape above.
 *
 * Reconciliation mechanism (how an existing/new skip satisfies the gate):
 *   1. Inline annotation — an `// ADR-054: <reference>` comment within the 20
 *      lines immediately preceding (up to and including) the skip call's own
 *      line, where `<reference>` is one of: a finding ID (`QUAL-006`,
 *      `RACE-PURE-09`, ...), a task ID (`ENG-OPS-002.R10`), a GitHub issue
 *      (`#123`), or the literal `DEFERRED`. See `ANNOTATION_PATTERN`.
 *   2. Allowlist entry — `tools/scripts/flaky-test-gate.allowlist.json` for the
 *      rare case where the annotation can't be added to the file itself (e.g. a
 *      file slated for deletion by a parallel PR). Entries still require the
 *      same reference format in their `reason` field, so this cannot become a
 *      silent blanket bypass.
 *
 * Verify: `npx tsx tools/scripts/flaky-test-skip-gate.ts`
 *
 * @module tools/scripts/flaky-test-skip-gate
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { findRepoRoot } from './lib/validation-utils.js';

// ============================================================================
// Constants
// ============================================================================

/** Vitest/Jest test-registration APIs this gate cares about. */
const TEST_APIS = new Set(['test', 'it', 'describe']);

/** Member-call properties that constitute a "hard skip" per ADR-054. */
const SKIP_PROPERTIES = new Set(['skip', 'todo']);

/** Bare Jest-style skip identifiers (no property access). */
const BARE_SKIP_IDENTIFIERS = new Set(['xit', 'xdescribe', 'xtest']);

/** Modules whose named `test`/`it`/`describe` exports resolve to a TEST_APIS canonical name. */
const RECOGNIZED_TEST_MODULES = new Set(['vitest', '@fast-check/vitest']);

/** Test-file suffixes this gate scans (git-tracked files only). */
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

/**
 * An accepted annotation/reason must reference something concrete: a finding ID
 * (2+ uppercase segments joined by hyphens, e.g. `QUAL-006`, `RACE-PURE-09`,
 * `PROTO-ROUTE-01`), a task ID (`ENG-OPS-002.R##`), a GitHub issue (`#123`), or
 * the literal word `DEFERRED`. This is deliberately not "any comment" — an
 * annotation with no concrete reference doesn't satisfy the policy.
 */
const ANNOTATION_PATTERN =
  /ADR-054:\s*(#\d+|DEFERRED\b|ENG-OPS-002\.R\d+|[A-Z][A-Z0-9]{1,20}(-[A-Z0-9]{1,20}){1,4})/;

/** How many lines above (and including) the skip call to search for an inline annotation. */
const ANNOTATION_WINDOW_LINES = 20;

const ALLOWLIST_PATH = 'tools/scripts/flaky-test-gate.allowlist.json';

// ============================================================================
// Types
// ============================================================================

export interface SkipSite {
  /** Repo-relative path, forward-slash normalized. */
  file: string;
  /** 1-based line number of the call expression. */
  line: number;
  /** e.g. `it.skip`, `vitestTest.skip` (as written), `xdescribe`. */
  api: string;
  /** Trimmed source line text, for reporting. */
  snippet: string;
}

export type ReconciliationKind = 'annotated' | 'allowlisted' | 'violation';

export interface ReconciledSkipSite extends SkipSite {
  kind: ReconciliationKind;
  /** The matched reference (e.g. `QUAL-006`, `DEFERRED`) when annotated/allowlisted. */
  reference?: string;
}

export interface AllowlistEntry {
  /** Repo-relative file path. */
  file: string;
  /** A substring that must appear on the flagged skip call's source line. */
  match: string;
  /** Must satisfy ANNOTATION_PATTERN — same reference requirement as inline annotations. */
  reason: string;
}

export interface GateResult {
  sites: ReconciledSkipSite[];
  violations: ReconciledSkipSite[];
  annotated: ReconciledSkipSite[];
  allowlisted: ReconciledSkipSite[];
  ok: boolean;
  filesScanned: number;
  elapsedMs: number;
}

export interface RunOptions {
  /** Injectable file lister for tests (defaults to `git ls-files`). */
  listFiles?: (repoRoot: string) => string[];
  /** Injectable file reader for tests. */
  readFile?: (absPath: string) => string;
  /** Injectable allowlist loader for tests. */
  loadAllowlist?: (repoRoot: string) => AllowlistEntry[];
  now?: () => number;
}

// ============================================================================
// AST detection (pure — operates on already-read source text)
// ============================================================================

/** Walk a member-access chain (`a.b.c`) down to its root expression + property names. */
function unwrapMemberChain(expr: ts.Expression): { root: ts.Expression; props: string[] } {
  const props: string[] = [];
  let current: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) {
    props.unshift(current.name.text);
    current = current.expression;
  }
  return { root: current, props };
}

/**
 * Build a map of local-identifier -> canonical vitest API name (`test`/`it`/
 * `describe`) from named imports of `vitest` or `@fast-check/vitest`, so
 * `import { test as vitestTest } from 'vitest'` resolves `vitestTest` back to
 * `test`.
 */
function buildTestApiAliasMap(sourceFile: ts.SourceFile): Map<string, string> {
  const aliasMap = new Map<string, string>();

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      RECOGNIZED_TEST_MODULES.has(node.moduleSpecifier.text) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const spec of node.importClause.namedBindings.elements) {
        const importedName = (spec.propertyName ?? spec.name).text;
        if (TEST_APIS.has(importedName)) {
          aliasMap.set(spec.name.text, importedName);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return aliasMap;
}

/**
 * Resolve an identifier used as the root of a member-access chain to its
 * canonical vitest API name, if any. Falls back to treating the bare name
 * itself as canonical when there's no explicit import (vitest's `globals: true`
 * config makes `test`/`it`/`describe` ambient).
 */
function resolveCanonicalApi(
  aliasMap: Map<string, string>,
  identifierName: string
): string | undefined {
  const aliased = aliasMap.get(identifierName);
  if (aliased) return aliased;
  return TEST_APIS.has(identifierName) ? identifierName : undefined;
}

/** True when `arg` is a function definition (the declarative-skip shape needs one as its last argument). */
function isDefinitionCallback(arg: ts.Expression | undefined): boolean {
  return !!arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
}

/** The ADR-054-relevant API label for a bare call (`xit(...)`), or undefined if it isn't one. */
function detectBareSkipApi(callee: ts.LeftHandSideExpression): string | undefined {
  if (!ts.isIdentifier(callee)) return undefined;
  return BARE_SKIP_IDENTIFIERS.has(callee.text) ? callee.text : undefined;
}

/** The ADR-054-relevant API label for a member-access call (`it.skip(...)`), or undefined. */
function detectMemberSkipApi(
  callee: ts.LeftHandSideExpression,
  aliasMap: Map<string, string>
): string | undefined {
  if (!ts.isPropertyAccessExpression(callee)) return undefined;

  const { root, props } = unwrapMemberChain(callee);
  const lastProp = props.at(-1);
  if (!lastProp || !SKIP_PROPERTIES.has(lastProp) || !ts.isIdentifier(root)) return undefined;

  const canonical = resolveCanonicalApi(aliasMap, root.text);
  return canonical ? `${root.text}.${props.join('.')}` : undefined;
}

/**
 * Determine the ADR-054-relevant API label for a call expression (e.g.
 * `it.skip`, `vitestTest.skip`, `xdescribe`), or undefined when the call
 * doesn't match the declarative "disable this test/suite definition" shape.
 */
function detectSkipApi(node: ts.CallExpression, aliasMap: Map<string, string>): string | undefined {
  const lastArg = node.arguments.at(-1);
  if (!isDefinitionCallback(lastArg)) return undefined;

  return detectBareSkipApi(node.expression) ?? detectMemberSkipApi(node.expression, aliasMap);
}

/**
 * Scan a single already-parsed source file for ADR-054-relevant skip call
 * sites. Pure w.r.t. the filesystem — takes source text, returns findings.
 */
export function findSkipSitesInSource(repoRelativePath: string, sourceText: string): SkipSite[] {
  const scriptKind = repoRelativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    repoRelativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind
  );

  const aliasMap = buildTestApiAliasMap(sourceFile);
  const lines = sourceText.split(/\r?\n/);
  const sites: SkipSite[] = [];

  function recordSite(node: ts.CallExpression, api: string): void {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    sites.push({
      file: repoRelativePath,
      line: line + 1,
      api,
      snippet: (lines[line] ?? '').trim(),
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const api = detectSkipApi(node, aliasMap);
      if (api) recordSite(node, api);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sites;
}

// ============================================================================
// Annotation / allowlist reconciliation (pure)
// ============================================================================

/** Extract the reference token (group 1) from the first ANNOTATION_PATTERN match, if any. */
function extractReference(text: string): string | undefined {
  const match = ANNOTATION_PATTERN.exec(text);
  return match?.[1];
}

/**
 * Check whether a skip site has a satisfying inline `// ADR-054: <reference>`
 * annotation within the lookback window (its own line included, to also catch
 * the repo's occasional "comment right after the opening paren" style).
 */
export function findInlineAnnotation(
  sourceLines: string[],
  siteLine: number,
  windowLines: number = ANNOTATION_WINDOW_LINES
): string | undefined {
  const endIdx = siteLine - 1; // 0-based index of the site's own line
  const startIdx = Math.max(0, endIdx - windowLines);
  const window = sourceLines.slice(startIdx, endIdx + 1).join('\n');
  return extractReference(window);
}

/** Find an allowlist entry matching this site (same file + substring match on its source line). */
export function findAllowlistMatch(
  entries: AllowlistEntry[],
  site: SkipSite
): AllowlistEntry | undefined {
  return entries.find((e) => e.file === site.file && site.snippet.includes(e.match));
}

/**
 * Reconcile one skip site against inline annotations (already resolved) and
 * the allowlist: annotated > allowlisted > violation.
 */
export function reconcileSite(
  site: SkipSite,
  sourceLines: string[],
  allowlist: AllowlistEntry[]
): ReconciledSkipSite {
  const inline = findInlineAnnotation(sourceLines, site.line);
  if (inline) {
    return { ...site, kind: 'annotated', reference: inline };
  }

  const allowlisted = findAllowlistMatch(allowlist, site);
  if (allowlisted) {
    const reference = extractReference(allowlisted.reason);
    if (reference) {
      return { ...site, kind: 'allowlisted', reference };
    }
    // Allowlist entry exists but its own reason doesn't carry a real
    // reference — treat as a violation so the allowlist itself can't become a
    // silent bypass mechanism.
  }

  return { ...site, kind: 'violation' };
}

// ============================================================================
// Filesystem I/O
// ============================================================================

function defaultListFiles(repoRoot: string): string[] {
  const stdout = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf-8' });
  return stdout
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && TEST_FILE_PATTERN.test(f));
}

function defaultReadFile(absPath: string): string {
  return readFileSync(absPath, 'utf-8');
}

export function loadAllowlist(repoRoot: string): AllowlistEntry[] {
  const absPath = resolve(repoRoot, ALLOWLIST_PATH);
  if (!existsSync(absPath)) return [];

  try {
    let raw = readFileSync(absPath, 'utf-8');
    // Strip a leading BOM (U+FEFF) via char code rather than a literal-character
    // regex/string, which some editors/linters flag as "irregular whitespace".
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray((parsed as { entries?: unknown })?.entries)
      ? (parsed as { entries: unknown[] }).entries
      : [];
    return entries.filter(
      (e): e is AllowlistEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as AllowlistEntry).file === 'string' &&
        typeof (e as AllowlistEntry).match === 'string' &&
        typeof (e as AllowlistEntry).reason === 'string'
    );
  } catch {
    return [];
  }
}

// ============================================================================
// Runner
// ============================================================================

export function runFlakyTestSkipGate(repoRoot: string, opts: RunOptions = {}): GateResult {
  const listFiles = opts.listFiles ?? defaultListFiles;
  const readFile = opts.readFile ?? defaultReadFile;
  const loadAllowlistFn = opts.loadAllowlist ?? loadAllowlist;
  const now = opts.now ?? (() => Date.now());
  const start = now();

  const files = listFiles(repoRoot);
  const allowlist = loadAllowlistFn(repoRoot);

  const sites: ReconciledSkipSite[] = [];
  for (const relPath of files) {
    const absPath = resolve(repoRoot, relPath);
    let text: string;
    try {
      text = readFile(absPath);
    } catch {
      continue;
    }
    const rawSites = findSkipSitesInSource(relPath, text);
    if (rawSites.length === 0) continue;
    const sourceLines = text.split(/\r?\n/);
    for (const site of rawSites) {
      sites.push(reconcileSite(site, sourceLines, allowlist));
    }
  }

  const violations = sites.filter((s) => s.kind === 'violation');
  const annotated = sites.filter((s) => s.kind === 'annotated');
  const allowlisted = sites.filter((s) => s.kind === 'allowlisted');

  return {
    sites,
    violations,
    annotated,
    allowlisted,
    ok: violations.length === 0,
    filesScanned: files.length,
    elapsedMs: now() - start,
  };
}

// ============================================================================
// Reporting
// ============================================================================

export function formatReport(result: GateResult): string {
  const lines: string[] = [];
  lines.push('Flaky-Test Skip Gate (ENG-OPS-002.R13 / QUAL-012 — ADR-054 enforcement)');
  lines.push('─'.repeat(72));
  lines.push(`Test files scanned: ${result.filesScanned}`);
  lines.push(
    `Skip sites found: ${result.sites.length} (annotated: ${result.annotated.length}, allowlisted: ${result.allowlisted.length}, violations: ${result.violations.length})`
  );
  lines.push('');

  if (result.ok) {
    lines.push('✓ PASS — every test.skip/it.skip/describe.skip/xit/xdescribe/xtest carries an');
    lines.push('  approved ADR-054 annotation or allowlist entry.');
    if (result.sites.length > 0) {
      lines.push('');
      lines.push('Reconciled skips:');
      for (const s of result.sites) {
        lines.push(`  • [${s.kind}] ${s.file}:${s.line} (${s.api}) — ${s.reference}`);
      }
    }
  } else {
    lines.push(`✗ FAIL — ${result.violations.length} unannotated skip(s):`);
    for (const v of result.violations) {
      lines.push(`  • ${v.file}:${v.line} — ${v.api}`);
      lines.push(`      ${v.snippet}`);
    }
    lines.push('');
    lines.push('How to fix: either fix the underlying issue and remove the skip, or add an');
    lines.push('approved annotation directly above the call:');
    lines.push('  // ADR-054: QUAL-XXX — <short reason>. See quality-findings.json.');
    lines.push('(accepted references: a finding ID like QUAL-006/RACE-PURE-09, a task ID like');
    lines.push('ENG-OPS-002.R13, a GitHub issue #123, or the literal DEFERRED). If the file');
    lines.push('cannot be edited (e.g. pending deletion by a parallel PR), add an entry to');
    lines.push(`  ${ALLOWLIST_PATH}`);
    lines.push('See docs/architecture/adr/ADR-054-property-based-race-condition-testing.md');
    lines.push('(section 6, "Flaky-test policy") for the full policy.');
  }
  lines.push('');
  lines.push(`Completed in ${result.elapsedMs}ms.`);
  return lines.join('\n');
}

// ============================================================================
// CLI
// ============================================================================

/** Runs the gate and returns a process exit code (0 pass / 1 violations). Testable. */
export function main(repoRoot: string = findRepoRoot(), opts: RunOptions = {}): number {
  const result = runFlakyTestSkipGate(repoRoot, opts);
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    return 0;
  }
  console.error(report);
  return 1;
}

// CLI entry-point guard (mirrors docs-integrity-audit.ts).
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('flaky-test-skip-gate.ts')
) {
  process.exit(main());
}
