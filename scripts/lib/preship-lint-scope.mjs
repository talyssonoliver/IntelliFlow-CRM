/**
 * Changed-files scope for the local pre-ship format-check, lint and lint-promises
 * steps.
 *
 * Those three steps used to run over the whole monorepo on every push, so a
 * four-file UI change spent about four and a half minutes re-checking thousands
 * of files nobody touched. Locally they now check only the files that differ
 * from the merge-base with origin/main. CI keeps its own scope (scripts/ci/
 * affected.mjs) and is the safety net for anything a file-level check cannot see.
 *
 * Scopes:
 *   full    — check everything. Always under CI, on PRESHIP_FULL_LINT=1, when
 *             the base ref cannot be resolved, when git fails, or when a changed
 *             file configures the checks themselves (eslint, prettier, tsconfig,
 *             any package.json, the lockfile, the in-repo eslint rules).
 *   changed — check only `files`.
 *
 * "Changed" is the same set the test scope uses (scripts/lib/preship-test-scope.mjs):
 * committed, staged, unstaged and untracked files against the merge-base, minus
 * deletions. A dirty tree can only widen the set, never narrow it.
 */

import path from 'node:path';
import { nonEmptyLines, runGit } from './preship-git.mjs';

export const DEFAULT_BASE_REF = 'origin/main';

/** Env var that forces the repo-wide checks locally. */
export const FULL_LINT_ENV = 'PRESHIP_FULL_LINT';

/**
 * Files that change how OTHER files are formatted or linted. Any one of them in
 * the diff sends all three steps back to their repo-wide form.
 */
export const LINT_CONFIG_PATTERNS = [
  /(^|\/)package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)eslint\.[^/]*config\.[cm]?[jt]s$/,
  /(^|\/)\.eslintignore$/,
  /(^|\/)\.eslintrc[^/]*$/,
  /(^|\/)\.prettierrc[^/]*$/,
  /(^|\/)\.prettierignore$/,
  /(^|\/)prettier\.config\.[cm]?js$/,
  /^\.editorconfig$/,
  /^eslint-rules\//,
  /^tools\/eslint\//,
  /^tools\/lint\//,
  /^packages\/typescript-config\//,
  /^scripts\/lint-promises\.mjs$/,
  /^scripts\/run-scoped-lint\.mjs$/,
  /^scripts\/lib\/preship-lint-scope\.mjs$/,
];

/** The globs `format:check` passes to prettier, as one test. */
export const FORMAT_EXTENSION = /\.(ts|tsx|md|json|yml|yaml)$/;

const LINT_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

/**
 * Pure classification of a changed-file list. Exported for tests.
 * @param {string[]} changedFiles repo-relative, forward-slash paths
 * @returns {{scope: 'full'|'changed', reason: string, files: string[]}}
 */
export function classifyLintFiles(changedFiles) {
  const unique = [
    ...new Set(changedFiles.map((f) => f.replaceAll('\\', '/')).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const configHit = unique.find((f) => LINT_CONFIG_PATTERNS.some((re) => re.test(f)));
  if (configHit) {
    return {
      scope: 'full',
      reason: `${configHit} changed — it can change how unchanged files are checked`,
      files: [],
    };
  }
  return { scope: 'changed', reason: `${unique.length} changed file(s)`, files: unique };
}

const defaultGit = runGit;

const lines = nonEmptyLines;

/**
 * Resolve the lint scope for this checkout.
 * @param {{cwd: string, env?: NodeJS.ProcessEnv, baseRef?: string, git?: Function}} opts
 */
export function resolveLintScope({
  cwd,
  env = process.env,
  baseRef = DEFAULT_BASE_REF,
  git = defaultGit,
}) {
  if (env.CI === 'true' || env.CI === '1') {
    return { scope: 'full', reason: 'CI checks the whole repo', files: [] };
  }
  if (env[FULL_LINT_ENV] === '1') {
    return { scope: 'full', reason: `${FULL_LINT_ENV}=1`, files: [] };
  }
  const base = (git(['merge-base', 'HEAD', baseRef], cwd, env) || '').trim();
  if (!base) {
    return { scope: 'full', reason: `cannot resolve merge-base with ${baseRef}`, files: [] };
  }
  const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', base], cwd, env);
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd, env);
  if (tracked === null || untracked === null) {
    return { scope: 'full', reason: 'git diff failed', files: [] };
  }
  return classifyLintFiles([...lines(tracked), ...lines(untracked)]);
}

/** The changed files prettier's `format:check` globs would have covered. */
export function formatTargets(files) {
  return files.filter((f) => FORMAT_EXTENSION.test(f));
}

/**
 * The eslint globs a package's `lint` script passes, or null when the script is
 * not a plain `eslint <globs...>` call (the caller then runs that package's own
 * lint script whole). Exported for tests.
 * @param {string|undefined} script
 * @returns {string[]|null}
 */
export function eslintGlobs(script) {
  if (typeof script !== 'string') return null;
  const m = /^eslint((?:\s+(?:"[^"]+"|'[^']+'|[^\s-][^\s]*))+)\s*$/.exec(script.trim());
  if (!m) return null;
  const globs = [...m[1].matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map((x) => x[1] ?? x[2] ?? x[3]);
  return globs.map((g) => (g === '.' ? '**/*' : g.replace(/^\.\//, '').replace(/\/$/, '/**/*')));
}

/**
 * Group changed files by the workspace package whose `lint` script would have
 * linted them. Files no package lints (root scripts, docs) are left out, exactly
 * as `turbo run lint` leaves them out.
 *
 * @param {string[]} files repo-relative changed files
 * @param {{name: string, dir: string, lint?: string}[]} packages
 * @param {(file: string, glob: string) => boolean} matches
 * @returns {{eslint: {name: string, dir: string, files: string[]}[], whole: string[]}}
 *   `eslint`: per-package files to lint in that package's directory;
 *   `whole`: packages whose lint script is not plain eslint, to run as-is.
 */
export function lintPlan(files, packages, matches = path.posix.matchesGlob) {
  const deepestFirst = [...packages].sort((a, b) => b.dir.length - a.dir.length);
  const perPackage = new Map();
  const whole = new Set();
  for (const f of files) {
    if (!LINT_EXTENSION.test(f)) continue;
    const pkg = deepestFirst.find((p) => f.startsWith(p.dir + '/'));
    if (!pkg || typeof pkg.lint !== 'string') continue;
    const globs = eslintGlobs(pkg.lint);
    if (globs === null) {
      whole.add(pkg.name);
      continue;
    }
    const rel = f.slice(pkg.dir.length + 1);
    if (!globs.some((g) => matches(rel, g))) continue;
    if (!perPackage.has(pkg.name))
      perPackage.set(pkg.name, { name: pkg.name, dir: pkg.dir, files: [] });
    perPackage.get(pkg.name).files.push(rel);
  }
  return {
    eslint: [...perPackage.values()].sort((a, b) => a.name.localeCompare(b.name)),
    whole: [...whole].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Group changed files under the type-aware lint's source roots
 * (eslint.promises.config.mjs). One eslint run per root keeps each TypeScript
 * program small, as scripts/lint-promises.mjs does.
 * @param {string[]} files
 * @param {string[]} roots
 * @returns {{root: string, files: string[]}[]}
 */
export function promisesPlan(files, roots) {
  const out = [];
  for (const root of roots) {
    const inRoot = files.filter((f) => f.startsWith(root + '/') && /\.(ts|tsx)$/.test(f));
    if (inRoot.length) out.push({ root, files: inRoot });
  }
  return out;
}

/**
 * Split an argv list into chunks whose joined length stays well under the
 * Windows 32K command-line ceiling.
 */
export function chunkArgs(items, maxChars = 6000) {
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const it of items) {
    if (cur.length && len + it.length + 1 > maxChars) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += it.length + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** The repo-wide command each mode falls back to, as `pnpm` arguments. */
export const FULL_COMMAND = {
  format: ['run', 'format:check'],
  lint: ['run', 'lint'],
  promises: ['run', 'lint:promises'],
};

/**
 * Run one scoped step. All process, filesystem and workspace access comes in
 * through `io`, so the whole decision is tested in-process; the CLI
 * (scripts/run-scoped-lint.mjs) only wires it in.
 *
 * @param {'format'|'lint'|'promises'} mode
 * @param {{scope: 'full'|'changed', reason: string, files: string[]}} scope
 * @param {{root: string,
 *          run: (cmd: string, args: string[], cwd: string) => number,
 *          exists: (repoRelativePath: string) => boolean,
 *          packages: () => {name: string, dir: string, lint?: string}[],
 *          promiseRoots: () => Promise<string[]> | string[],
 *          log: (line: string) => void,
 *          join?: (...parts: string[]) => string}} io
 * @returns {Promise<number>} exit status: 0 clean, non-zero on any problem
 */
export async function runScopedLint(mode, scope, io) {
  io.log(`[scoped-lint] ${mode}: scope ${scope.scope} — ${scope.reason}`);
  if (scope.scope === 'full') return io.run('pnpm', FULL_COMMAND[mode], io.root);
  if (mode === 'format') return runFormat(scope.files, io);
  if (mode === 'lint') return runLint(scope.files, io);
  return runPromises(scope.files, io);
}

/**
 * Run `pnpm <args> <files>` in chunks that fit on a command line. Returns 0 when
 * every chunk passed, else the last non-zero status.
 */
function runInChunks(io, args, files, cwd) {
  let status = 0;
  for (const chunk of chunkArgs(files)) {
    const code = io.run('pnpm', [...args, ...chunk], cwd);
    if (code !== 0) status = code;
  }
  return status;
}

function runFormat(files, io) {
  const targets = formatTargets(files).filter((f) => io.exists(f));
  if (targets.length === 0) {
    io.log('[scoped-lint] format: no formattable files changed');
    return 0;
  }
  io.log(`[scoped-lint] format: prettier --check on ${targets.length} changed file(s)`);
  // --ignore-unknown and .prettierignore apply as they do to the repo-wide glob.
  return runInChunks(io, ['exec', 'prettier', '--check', '--ignore-unknown'], targets, io.root);
}

function runLint(files, io) {
  const join = io.join ?? path.join;
  const plan = lintPlan(files, io.packages());
  if (plan.eslint.length === 0 && plan.whole.length === 0) {
    io.log('[scoped-lint] lint: no file a package lint script covers changed');
    return 0;
  }
  let status = 0;
  for (const pkg of plan.eslint) {
    io.log(`[scoped-lint] lint: ${pkg.name} — ${pkg.files.length} changed file(s)`);
    const code = runInChunks(
      io,
      ['exec', 'eslint', '--no-warn-ignored'],
      pkg.files,
      join(io.root, pkg.dir)
    );
    if (code !== 0) status = code;
  }
  for (const name of plan.whole) {
    io.log(`[scoped-lint] lint: ${name} — its lint script is not plain eslint; running it whole`);
    const code = io.run('pnpm', ['--filter', name, 'run', 'lint'], io.root);
    if (code !== 0) status = code;
  }
  return status;
}

async function runPromises(files, io) {
  const plan = promisesPlan(files, await io.promiseRoots());
  if (plan.length === 0) {
    io.log('[scoped-lint] promises: no changed file under a type-aware source root');
    return 0;
  }
  const args = ['exec', 'eslint', '-c', 'eslint.promises.config.mjs', '--no-warn-ignored'];
  let status = 0;
  for (const { root: srcRoot, files: rootFiles } of plan) {
    io.log(`[scoped-lint] promises: ${srcRoot} — ${rootFiles.length} changed file(s)`);
    const code = runInChunks(io, args, rootFiles, io.root);
    if (code !== 0) status = code;
  }
  if (status !== 0) io.log('[scoped-lint] promises: floating promises found');
  return status;
}
