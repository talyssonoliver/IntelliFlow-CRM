/**
 * Test scope for the local pre-ship gate.
 *
 * The full Vitest suite (10k+ tests across 16 projects) belongs to CI's sharded
 * runners. On a laptop, pre-ship runs only the tests related to what this branch
 * changed (`vitest related`), so a push waits on the tests that can actually be
 * affected rather than on the whole monorepo. Typecheck, lint and every other
 * gate stay full and mandatory.
 *
 * Scopes:
 *   full    — run everything. Always under CI, on PRESHIP_FULL_TESTS=1, when the
 *             base ref cannot be resolved, when a changed file can affect tests it
 *             is not imported by (lockfile, package.json, vitest/tsconfig, Prisma
 *             schema, migration SQL, test setup), when a source/data/global file
 *             was deleted or renamed away, or when the diff is too large for argv.
 *   related — run `vitest related <files>` for the changed source and JSON data
 *             files, plus every test that names a changed scripts/ or tools/
 *             file (tests spawn those by path, outside the import graph).
 *   none    — no source file changed (docs/config-only diff); nothing to run.
 *
 * "Changed" is the union of four layers read separately against the merge-base
 * with the base ref: committed, staged, unstaged and untracked. A dirty tree can
 * only widen the selection, never narrow it — not even an edit that restores a
 * committed file's base content.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_BASE_REF = 'origin/main';

/**
 * Budget for the related-file list, in characters. The list travels as argv
 * (run-unit-tests-scoped.mjs, run-coverage.js) and as a JSON env value
 * (PRESHIP_TEST_SCOPE_JSON / COVERAGE_RELATED_FILES); on Windows both a command
 * line and a single env value cap at 32,767 chars. JSON quoting adds ~3 chars a
 * path and the runner adds its own args, so stop well short: past this, the
 * diff is large enough that the full suite is the honest answer anyway.
 */
export const MAX_RELATED_CHARS = 24_000;

/** Files whose effect on tests is not visible through the import graph. */
const GLOBAL_IMPACT_PATTERNS = [
  /(^|\/)package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)turbo\.json$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vitest\.[^/]+$/,
  /(^|\/)vite\.config\.[^/]+$/,
  /(^|\/)setup\.(ts|tsx|js|mjs)$/,
  /(^|\/)src\/test\//,
  /\.prisma$/,
  // Migrations are read from disk (rls-migrations.test.ts lists the directory),
  // never imported.
  /\.sql$/,
];

// Modules `vitest related` can follow through imports. JSON is included: tests
// import data modules (pricing-data.json, team-data.json).
const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json)$/;

/** Trees whose files are never imported by a test (they may be READ by one). */
const NON_SOURCE_PREFIXES = ['artifacts/', 'docs/', '.github/', 'infra/'];

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs|cjs|mts|cts)$/;

const normalise = (f) => f.replace(/\\/g, '/');

const isImportableSource = (f) =>
  SOURCE_EXTENSION.test(f) && !NON_SOURCE_PREFIXES.some((p) => f.startsWith(p));

/**
 * A path whose deletion can matter to a test: a module, a data file, a global
 * input, or anything a test names (checked by the caller via references).
 */
function isTestRelevant(f) {
  if (GLOBAL_IMPACT_PATTERNS.some((re) => re.test(f))) return true;
  return isImportableSource(f);
}

/**
 * The strings a test would use to reach a file WITHOUT importing it: its name
 * (`'git-destructive-guard.mjs'`, `'PAGE_MAP_AND_FLOWS.md'`), its repo path,
 * and its folder path (`'docs/design'` for tests that walk a directory).
 */
// Names so common that matching them by name would select a large share of the
// suite (and push the run to `full`): for these, only the path needles apply.
const GENERIC_BASENAME = /^(index|types|utils|constants|helpers)\.(ts|tsx|js|jsx|mjs|cjs)$/;

function referenceNeedles(file) {
  const parts = file.split('/');
  const base = parts.at(-1);
  const needles = [GENERIC_BASENAME.test(base) ? '' : base, file];
  if (parts.length > 2) needles.push(parts.slice(0, -1).join('/'));
  return needles.filter((n) => n && n.length >= 4);
}

/**
 * Test files that name a changed file. Tests read docs, fixtures, CSVs, hook
 * scripts and CLI tools by path, spawn them, or copy them; none of that is in
 * the import graph `vitest related` follows, so those tests are added by name.
 * Over-selection is the safe direction. Pure: takes the test contents.
 * @param {string[]} changedFiles
 * @param {Map<string, string>} testContents test path -> source text
 * @returns {string[]}
 */
export function testsReferencingChanges(changedFiles, testContents) {
  const needles = [
    ...new Set(
      changedFiles
        .map(normalise)
        .filter((f) => !TEST_FILE.test(f))
        .flatMap(referenceNeedles)
    ),
  ];
  if (needles.length === 0) return [];
  const out = [];
  for (const [testPath, text] of testContents) {
    if (needles.some((n) => text.includes(n))) out.push(normalise(testPath));
  }
  return out.sort();
}

/**
 * Pure classification of the changed files into a scope. Exported for tests.
 * @param {string[]} changedFiles repo-relative, forward-slash paths (still present)
 * @param {{deleted?: string[], referencingTests?: string[]}} [extra]
 *   deleted: paths removed (or renamed away) in any layer of the change;
 *   referencingTests: tests that name a changed file (reach it by path)
 * @returns {{scope: 'full'|'related'|'none', reason: string, files: string[]}}
 */
export function classifyChangedFiles(changedFiles, { deleted = [], referencingTests = [] } = {}) {
  const unique = [...new Set(changedFiles.map(normalise).filter(Boolean))];

  const globalHit = unique.find((f) => GLOBAL_IMPACT_PATTERNS.some((re) => re.test(f)));
  if (globalHit) {
    return {
      scope: 'full',
      reason: `${globalHit} changed — it can affect tests that do not import it`,
      files: [],
    };
  }

  // A deleted file cannot be handed to `vitest related`, and some are referenced
  // only by strings typecheck cannot validate (a setupFiles entry). Never narrow
  // past one.
  const deletedHit = deleted.map(normalise).find(isTestRelevant);
  if (deletedHit) {
    return {
      scope: 'full',
      reason: `${deletedHit} was deleted — related selection cannot see what used it`,
      files: [],
    };
  }

  const files = [
    ...new Set([...unique.filter(isImportableSource), ...referencingTests.map(normalise)]),
  ].sort();

  if (files.length === 0) {
    return { scope: 'none', reason: 'no source files changed and no test names one', files: [] };
  }
  const chars = files.reduce((n, f) => n + f.length + 3, 0);
  if (chars > MAX_RELATED_CHARS) {
    return {
      scope: 'full',
      reason: `${files.length} related files (${chars} chars) exceed the argv/env budget — running the full suite`,
      files: [],
    };
  }
  return {
    scope: 'related',
    reason: `${files.length} related file(s)`,
    files,
  };
}

/**
 * process.env without the GIT_* variables a git hook exports. Under the
 * pre-push hook GIT_DIR (and friends) point at the pushing repo and override
 * `cwd`, so any git call meant for another checkout would silently read this
 * one. Dropping them lets git discover the repo from `cwd`, which for pre-ship
 * (cwd = repo root) is the same repo.
 */
function gitEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return env;
}

/**
 * Run git. Paths are requested NUL-separated (-z) by every caller, and
 * core.quotepath=false keeps non-ASCII names literal, so a path never arrives
 * quoted or octal-escaped (which would fail every extension/prefix check).
 */
function git(args, cwd) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    env: gitEnv(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}

const nulFields = (out) => (out || '').split('\0').filter((f) => f !== '');

/**
 * Resolve the test scope for this checkout.
 * @param {{cwd: string, env?: NodeJS.ProcessEnv, baseRef?: string}} opts
 * @returns {{scope: 'full'|'related'|'none', reason: string, files: string[], base: string|null}}
 */
export function resolveTestScope({ cwd, env = process.env, baseRef = DEFAULT_BASE_REF }) {
  if (env.CI === 'true' || env.CI === '1') {
    return { scope: 'full', reason: 'CI runs the full suite', files: [], base: null };
  }
  // Full-scope results still carry the worktree fingerprint: pre-ship's cache is
  // keyed on it, and without one an uncommitted edit would reuse a cached PASS.
  const fullScope = (reason, base = null) => ({
    scope: 'full',
    reason,
    files: [],
    base,
    worktree: worktreeFingerprint(
      cwd,
      nulFields(git(['ls-files', '-z', '--others', '--exclude-standard'], cwd)).filter(
        (f) => !isGateOutput(f)
      )
    ),
  });
  if (env.PRESHIP_FULL_TESTS === '1') return fullScope('PRESHIP_FULL_TESTS=1');

  const base = (git(['merge-base', 'HEAD', baseRef], cwd) || '').trim();
  if (!base) {
    return fullScope(`cannot resolve merge-base with ${baseRef} — running the full suite`);
  }

  // Each layer is read SEPARATELY and unioned. A single base-to-working-tree
  // diff would let an uncommitted edit that restores a file's base content hide
  // a committed change to it, and the push sends the commits, not the tree.
  const layers = [
    git(['diff', '-z', '--name-status', '-M', base, 'HEAD'], cwd), // committed
    git(['diff', '-z', '--name-status', '-M', '--cached'], cwd), // staged
    git(['diff', '-z', '--name-status', '-M'], cwd), // unstaged
  ];
  const untracked = git(['ls-files', '-z', '--others', '--exclude-standard'], cwd);
  if (layers.includes(null) || untracked === null) {
    return fullScope('git diff failed — running the full suite', base);
  }

  // Every path any layer touched (both sides of a rename). Under artifacts/ only
  // COMMITTED or STAGED changes count: the gate rewrites tracked outputs there
  // (coverage, reports) on every run, and those uncommitted rewrites are not
  // part of the change — but a committed artifacts/ file that a test reads
  // (e.g. artifacts/misc/onboarding-config.json) is.
  const touched = new Set();
  const touch = (p, layerIndex) => {
    if (p && !(isGateOutput(p) && layerIndex >= 2)) touched.add(p);
  };
  layers.forEach((layer, i) => {
    for (const entry of parseNameStatus(layer)) {
      touch(entry.path, i);
      touch(entry.from, i); // a rename removes the old path
    }
  });
  for (const p of nulFields(untracked)) touch(p, 3);

  // Present or deleted by what is on disk NOW, not by which layer said what: a
  // file changed in a commit and then deleted in the working tree is deleted.
  const present = new Set();
  const deleted = new Set();
  for (const p of touched) (existsSync(path.join(cwd, p)) ? present : deleted).add(p);

  const changed = [...present];
  // Referencing tests also cover deleted files: a test that names a removed
  // fixture must run (and will fail) rather than be skipped.
  let referencingTests = [];
  if (changed.length + deleted.size > 0) {
    const testContents = readTestFiles(cwd);
    if (testContents === null) {
      // Fail closed: without the test list, by-name selection is blind.
      return fullScope('git ls-files failed — running the full suite', base);
    }
    referencingTests = testsReferencingChanges([...changed, ...deleted], testContents);
  }
  return {
    ...classifyChangedFiles(changed, { deleted: [...deleted], referencingTests }),
    base,
    // The Python audit tooling has pytest suites Vitest never runs; pre-ship's
    // audit-pytest step keys on this. (A `full` scope runs them regardless.)
    auditChanged: [...changed, ...deleted].some((f) => f.startsWith('tools/audit/')),
    // Fingerprint of the uncommitted content the tests will run against. Part
    // of pre-ship's cache key, so editing an already-changed file again (same
    // file list, same HEAD) re-runs the test steps instead of reusing a PASS.
    worktree: worktreeFingerprint(
      cwd,
      nulFields(untracked).filter((f) => !isGateOutput(f))
    ),
  };
}

const GATE_OUTPUT_PREFIX = 'artifacts/';
const isGateOutput = (f) => f.startsWith(GATE_OUTPUT_PREFIX);

/**
 * Hash of tracked uncommitted changes plus untracked files' size and mtime,
 * excluding the gate's own outputs (else every run would invalidate the cache).
 * If the diff cannot be read, the fingerprint is unique, so nothing is reused.
 */
function worktreeFingerprint(cwd, untracked) {
  const h = createHash('sha256');
  const diff = git(['diff', 'HEAD', '--binary', '--', '.', `:(exclude)${GATE_OUTPUT_PREFIX}`], cwd);
  h.update(diff ?? `diff-failed:${process.pid}:${Date.now()}:${Math.random()}`);
  for (const f of [...untracked].sort()) {
    try {
      const st = statSync(path.join(cwd, f));
      h.update(JSON.stringify([f, st.size, st.mtimeMs]));
    } catch {
      h.update(JSON.stringify([f, 'gone']));
    }
  }
  return h.digest('hex').slice(0, 16);
}

/**
 * Parse `git diff -z --name-status -M` output: NUL-separated fields, a status
 * then one path (two for a rename/copy: source, destination).
 * @returns {{status: string, path: string, from?: string}[]}
 */
export function parseNameStatus(out) {
  const fields = nulFields(out);
  const entries = [];
  for (let i = 0; i < fields.length; ) {
    const status = fields[i].charAt(0);
    if (status === 'R' || status === 'C') {
      const [from, to] = [fields[i + 1], fields[i + 2]];
      if (to) entries.push(status === 'R' ? { status, path: to, from } : { status, path: to });
      i += 3;
    } else {
      if (fields[i + 1]) entries.push({ status, path: fields[i + 1] });
      i += 2;
    }
  }
  return entries;
}

/**
 * Tracked vitest test files and their contents (Playwright e2e excluded), or
 * null when git cannot list them (the caller then runs the full suite).
 */
function readTestFiles(cwd) {
  const listed = git(['ls-files', '-z'], cwd);
  if (listed === null) return null;
  const contents = new Map();
  for (const f of nulFields(listed)) {
    if (!TEST_FILE.test(f) || f.startsWith('tests/e2e/')) continue;
    try {
      contents.set(f, readFileSync(path.join(cwd, f), 'utf8'));
    } catch {
      // deleted in the working tree — nothing to select
    }
  }
  return contents;
}

/** Env var pre-ship uses to hand its resolved scope to the step subprocesses. */
export const SCOPE_ENV = 'PRESHIP_TEST_SCOPE_JSON';

/**
 * Read a scope handed down by pre-ship, or resolve one for a standalone run.
 */
export function scopeFromEnvOrResolve({ cwd, env = process.env }) {
  const raw = env[SCOPE_ENV];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (['full', 'related', 'none'].includes(parsed.scope) && Array.isArray(parsed.files)) {
        return parsed;
      }
    } catch {
      // fall through and resolve afresh — a malformed hand-off must not narrow the run
    }
    console.warn(`warn: ignoring malformed ${SCOPE_ENV}; resolving the test scope afresh`);
  }
  return resolveTestScope({ cwd, env });
}
