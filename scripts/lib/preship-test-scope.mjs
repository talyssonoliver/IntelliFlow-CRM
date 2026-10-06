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
 *             is not imported by (lockfile, package.json beyond `scripts`,
 *             vitest/tsconfig, Prisma schema, test setup), or when the diff is too
 *             large to pass as argv.
 *   related — run `vitest related <files>` for the changed source files.
 *   none    — no source file changed (docs/config-only diff); nothing to run.
 *
 * "Changed" means everything that differs from the merge-base with the base ref:
 * committed, staged, unstaged and untracked files. That is a superset of what a
 * push sends, so a dirty tree can only widen the selection, never narrow it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
];

const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

/** Trees that never hold code a test can import. */
const NON_SOURCE_PREFIXES = ['artifacts/', 'docs/', '.github/', 'infra/'];

/**
 * Pure classification of a changed-file list into a scope. Exported for tests.
 * @param {string[]} changedFiles repo-relative, forward-slash paths
 * @returns {{scope: 'full'|'related'|'none', reason: string, files: string[]}}
 */
export function classifyChangedFiles(changedFiles) {
  const unique = [...new Set(changedFiles.map((f) => f.replace(/\\/g, '/')).filter(Boolean))];

  const globalHit = unique.find((f) => GLOBAL_IMPACT_PATTERNS.some((re) => re.test(f)));
  if (globalHit) {
    return {
      scope: 'full',
      reason: `${globalHit} changed — it can affect tests that do not import it`,
      files: [],
    };
  }

  const sources = unique
    .filter((f) => SOURCE_EXTENSION.test(f))
    .filter((f) => !NON_SOURCE_PREFIXES.some((p) => f.startsWith(p)))
    .sort();

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

/** JSON with object keys sorted, so key order alone never reads as a change. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, canonical(value[k])])
    );
  }
  return value;
}

/**
 * True when two package.json texts differ only in `scripts`. A scripts edit
 * changes what `pnpm run x` does, not what any test imports or resolves, so it
 * must not widen the run to the full suite (a one-line scripts change used to
 * cost a 15-minute full unit run plus a full coverage run). Anything else —
 * dependencies, overrides, exports, type, workspaces — still widens. Unparseable
 * text is never "scripts only". Exported for tests.
 * @param {string} before
 * @param {string} after
 */
export function isScriptsOnlyPackageJsonChange(before, after) {
  let a;
  let b;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return false;
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  delete a.scripts;
  delete b.scripts;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
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

  // `git diff <base>` (no second ref) compares the base with the WORKING TREE, so
  // it covers committed + staged + unstaged changes in one call. Deletions are
  // excluded: a deleted file cannot be passed to `vitest related`, and its
  // importers fail typecheck, which stays mandatory.
  const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', base], cwd);
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd);
  if (tracked === null || untracked === null) {
    return {
      scope: 'full',
      reason: 'git diff failed — running the full suite',
      files: [],
      base,
    };
  }

  // A package.json whose only change is `scripts` cannot affect a test, so it
  // drops out before classification instead of forcing the full suite. A new
  // package.json (no base version) still counts.
  const changed = lines(tracked).filter((f) => {
    if (!/(^|\/)package\.json$/.test(f)) return true;
    const before = git(['show', `${base}:${f}`], cwd);
    let after;
    try {
      after = fs.readFileSync(path.join(cwd, f), 'utf8');
    } catch {
      return true;
    }
    return before === null || !isScriptsOnlyPackageJsonChange(before, after);
  });

  return { ...classifyChangedFiles([...changed, ...lines(untracked)]), base };
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
