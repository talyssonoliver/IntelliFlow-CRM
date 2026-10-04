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
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_BASE_REF = 'origin/main';

/**
 * Above this many related files the argv approaches the Windows 32K
 * command-line ceiling, and a diff that large is better served by the full run.
 */
export const MAX_RELATED_FILES = 400;

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

// JSON is included: tests import data modules (pricing-data.json, team-data.json)
// and `vitest related` follows those imports like any other module.
const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json)$/;

/** Trees that never hold code a test can import. */
const NON_SOURCE_PREFIXES = ['artifacts/', 'docs/', '.github/', 'infra/'];

/**
 * Tooling trees whose files tests reach by spawning or copying them by path
 * (`spawnSync('node', ['scripts/x.mjs'])`), which the import graph cannot see.
 * A change here also selects every test that names the file.
 */
const SPAWNED_TOOLING_PREFIXES = ['scripts/', 'tools/'];

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs|cjs|mts|cts)$/;

const normalise = (f) => f.replace(/\\/g, '/');

/** A path whose change can matter to a test: a module, data file or global input. */
function isTestRelevant(f) {
  if (GLOBAL_IMPACT_PATTERNS.some((re) => re.test(f))) return true;
  return SOURCE_EXTENSION.test(f) && !NON_SOURCE_PREFIXES.some((p) => f.startsWith(p));
}

/**
 * Test files that reference a changed tooling file by name. Pure: takes the
 * test files' contents. Exported for tests.
 * @param {string[]} changedFiles
 * @param {Map<string, string>} testContents test path -> source text
 * @returns {string[]}
 */
export function testsReferencingTooling(changedFiles, testContents) {
  const names = changedFiles
    .map(normalise)
    .filter((f) => SPAWNED_TOOLING_PREFIXES.some((p) => f.startsWith(p)) && !TEST_FILE.test(f))
    .map((f) => f.split('/').pop())
    .filter(Boolean);
  if (names.length === 0) return [];
  const out = [];
  for (const [testPath, text] of testContents) {
    if (names.some((n) => text.includes(n))) out.push(normalise(testPath));
  }
  return out.sort();
}

/**
 * Pure classification of the changed files into a scope. Exported for tests.
 * @param {string[]} changedFiles repo-relative, forward-slash paths (still present)
 * @param {{deleted?: string[], referencingTests?: string[]}} [extra]
 *   deleted: paths removed (or renamed away) in any layer of the change;
 *   referencingTests: tests that reach changed tooling by path, not import
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

  const sources = [
    ...new Set([
      ...unique
        .filter((f) => SOURCE_EXTENSION.test(f))
        .filter((f) => !NON_SOURCE_PREFIXES.some((p) => f.startsWith(p))),
      ...referencingTests.map(normalise),
    ]),
  ].sort();

  if (sources.length === 0) {
    return { scope: 'none', reason: 'no source files changed', files: [] };
  }
  if (sources.length > MAX_RELATED_FILES) {
    return {
      scope: 'full',
      reason: `${sources.length} source files changed (> ${MAX_RELATED_FILES}) — too many to select`,
      files: [],
    };
  }
  return {
    scope: 'related',
    reason: `${sources.length} changed source file(s)`,
    files: sources,
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

function git(args, cwd) {
  const r = spawnSync('git', args, {
    cwd,
    env: gitEnv(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}

function lines(out) {
  return (out || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Resolve the test scope for this checkout.
 * @param {{cwd: string, env?: NodeJS.ProcessEnv, baseRef?: string}} opts
 * @returns {{scope: 'full'|'related'|'none', reason: string, files: string[], base: string|null}}
 */
export function resolveTestScope({ cwd, env = process.env, baseRef = DEFAULT_BASE_REF }) {
  if (env.CI === 'true' || env.CI === '1') {
    return { scope: 'full', reason: 'CI runs the full suite', files: [], base: null };
  }
  if (env.PRESHIP_FULL_TESTS === '1') {
    return { scope: 'full', reason: 'PRESHIP_FULL_TESTS=1', files: [], base: null };
  }

  const base = (git(['merge-base', 'HEAD', baseRef], cwd) || '').trim();
  if (!base) {
    return {
      scope: 'full',
      reason: `cannot resolve merge-base with ${baseRef} — running the full suite`,
      files: [],
      base: null,
    };
  }

  // Each layer is read SEPARATELY and unioned. A single base-to-working-tree
  // diff would let an uncommitted edit that restores a file's base content hide
  // a committed change to it, and the push sends the commits, not the tree.
  const layers = [
    git(['diff', '--name-status', '-M', base, 'HEAD'], cwd), // committed
    git(['diff', '--name-status', '-M', '--cached'], cwd), // staged
    git(['diff', '--name-status', '-M'], cwd), // unstaged
  ];
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd);
  if (layers.includes(null) || untracked === null) {
    return {
      scope: 'full',
      reason: 'git diff failed — running the full suite',
      files: [],
      base,
    };
  }

  const present = new Set(lines(untracked));
  const deleted = new Set();
  for (const layer of layers) {
    for (const entry of parseNameStatus(layer)) {
      if (entry.status === 'D') deleted.add(entry.path);
      else present.add(entry.path);
      if (entry.from) deleted.add(entry.from); // a rename removes the old path
    }
  }
  // Deleted in one layer but re-added in another means it still exists.
  for (const f of present) deleted.delete(f);

  const changed = [...present];
  const referencingTests = testsReferencingTooling(changed, readTestFiles(cwd));
  return {
    ...classifyChangedFiles(changed, { deleted: [...deleted], referencingTests }),
    base,
  };
}

/**
 * Parse `git diff --name-status -M` output.
 * @returns {{status: string, path: string, from?: string}[]}
 */
export function parseNameStatus(out) {
  const entries = [];
  for (const line of (out || '').split('\n')) {
    if (!line.trim()) continue;
    const [code, a, b] = line.split('\t');
    const status = code.charAt(0);
    if ((status === 'R' || status === 'C') && b) {
      entries.push(status === 'R' ? { status, path: b, from: a } : { status, path: b });
    } else if (a) {
      entries.push({ status, path: a });
    }
  }
  return entries;
}

/** Tracked vitest test files and their contents (Playwright e2e excluded). */
function readTestFiles(cwd) {
  const listed = git(['ls-files'], cwd);
  const contents = new Map();
  for (const f of lines(listed)) {
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
