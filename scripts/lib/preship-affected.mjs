/**
 * Affected-package scope for the local pre-ship library-build, typecheck and
 * build steps.
 *
 * Those steps ran turbo over every workspace package on every push. Locally they
 * now run over the packages the branch changed plus every package that depends
 * on them — the same classification CI uses (scripts/ci/affected.mjs), fed with
 * the local diff instead of the PR's. Turbo's local cache stays on, so packages
 * whose inputs did not change are cache hits either way.
 *
 * Modes (from scripts/ci/affected.mjs):
 *   full     — every package: under CI, with PRESHIP_FULL_BUILD=1, when the
 *              merge-base or the diff cannot be read, or when the diff touches a
 *              path that affects every package (root files, .github/, the shared
 *              tsconfig package, eslint rules, an unrecognised path).
 *   affected — `packages` (changed + dependents).
 *   none     — nothing to build or typecheck (docs, e2e or property tests only).
 *
 * `testsOrDocsOnly` is true when every changed file is a test file or docs: the
 * production `build` step has nothing new to compile and is skipped.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { classify, readWorkspacePackages } from '../ci/affected.mjs';

export const DEFAULT_BASE_REF = 'origin/main';
export const FULL_BUILD_ENV = 'PRESHIP_FULL_BUILD';

const byText = (a, b) => a.localeCompare(b);

/** Test files, test folders and docs: nothing `next build` or tsup compiles. */
const TEST_OR_DOC = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)__mocks__\//,
  /\.stories\.[jt]sx?$/,
  /\.md$/i,
  /^docs\//,
  /^artifacts\//,
  /^tests\//,
];

export function isTestOrDoc(file) {
  return TEST_OR_DOC.some((re) => re.test(file));
}

function gitEnv(env) {
  const out = { ...env };
  for (const k of Object.keys(out)) if (k.startsWith('GIT_')) delete out[k];
  return out;
}

function defaultGit(args, cwd, env) {
  const r = spawnSync('git', args, {
    cwd,
    env: gitEnv(env),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}

function lines(out) {
  return (out || '')
    .split('\n')
    .map((l) => l.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}

const FULL = (reason) => ({
  mode: 'full',
  reason,
  packages: [],
  testsOrDocsOnly: false,
  outsidePackages: true,
});

const DOC_ONLY = [/\.md$/i, /^docs\//, /^artifacts\//];

/**
 * @param {{cwd: string, env?: NodeJS.ProcessEnv, baseRef?: string, git?: Function,
 *          packages?: {name: string, dir: string, deps: string[]}[]}} opts
 * @returns {{mode: 'full'|'affected'|'none', reason: string, packages: string[],
 *            testsOrDocsOnly: boolean, outsidePackages: boolean}}
 */
export function resolveAffected({
  cwd,
  env = process.env,
  baseRef = DEFAULT_BASE_REF,
  git = defaultGit,
  packages,
}) {
  if (env.CI === 'true' || env.CI === '1') return FULL('CI builds every package');
  if (env[FULL_BUILD_ENV] === '1') return FULL(`${FULL_BUILD_ENV}=1`);
  const base = (git(['merge-base', 'HEAD', baseRef], cwd, env) || '').trim();
  if (!base) return FULL(`cannot resolve merge-base with ${baseRef}`);
  // Deletions count here: removing a file changes its package.
  const tracked = git(['diff', '--name-only', base], cwd, env);
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd, env);
  if (tracked === null || untracked === null) return FULL('git diff failed');
  const changed = [...new Set([...lines(tracked), ...lines(untracked)])].sort(byText);
  if (changed.length === 0) {
    return {
      mode: 'none',
      reason: 'no file changed',
      packages: [],
      testsOrDocsOnly: true,
      outsidePackages: false,
    };
  }
  let pkgs = packages;
  try {
    pkgs ??= readWorkspacePackages(cwd);
  } catch (err) {
    return FULL(`cannot read the workspace packages: ${err.message}`);
  }
  const result = classify(changed, pkgs, []);
  return {
    mode: result.mode,
    reason: result.reason,
    packages: result.packages,
    testsOrDocsOnly: changed.every(isTestOrDoc),
    // Root scripts, root tests and the integration suite import the libraries
    // from dist/ too, so a change there needs every library built.
    outsidePackages: changed.some(
      (f) => !DOC_ONLY.some((re) => re.test(f)) && !pkgs.some((p) => f.startsWith(p.dir + '/'))
    ),
  };
}

/** `--filter=<name>` for each package, in a stable order. */
export function turboFilters(packages) {
  return [...packages].sort(byText).map((p) => `--filter=${p}`);
}

/** Env var pre-ship uses to hand the resolved scope to its step subprocesses. */
export const AFFECTED_ENV = 'PRESHIP_AFFECTED_JSON';

/** Read the scope pre-ship handed down, or resolve one for a standalone run. */
export function affectedFromEnvOrResolve({ cwd, env = process.env }) {
  const raw = env[AFFECTED_ENV];
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (['full', 'affected', 'none'].includes(p.mode) && Array.isArray(p.packages)) return p;
    } catch {
      // fall through: a malformed hand-off must not narrow the run
    }
  }
  return resolveAffected({ cwd, env });
}

/** The four apps pre-ship's library-build leaves to the `build` step. */
export const APP_PACKAGES = [
  '@intelliflow/web',
  '@intelliflow/api',
  '@intelliflow/project-tracker',
  '@intelliflow/workers',
];

/**
 * Turbo filters for the typecheck step. `null` means every package (no filter);
 * an empty array means there is nothing to typecheck.
 */
export function typecheckFilters(scope) {
  if (scope.mode === 'full') return null;
  if (scope.mode === 'none') return [];
  return turboFilters(scope.packages);
}

/**
 * Turbo filters for library-build: the affected libraries, and the dependencies
 * of each affected app (`<app>^...`), which its typecheck and tests read from
 * dist/. `null` means the original repo-wide library build, which a change
 * outside every package (root scripts, root tests) also needs: their tests
 * import any library.
 */
export function libraryBuildFilters(scope) {
  if (scope.mode === 'full' || scope.outsidePackages) return null;
  if (scope.mode === 'none') return [];
  return [...scope.packages]
    .sort(byText)
    .map((p) => (APP_PACKAGES.includes(p) ? `--filter=${p}^...` : `--filter=${p}`));
}

/**
 * Turbo filters for the production build. Empty (skip) when nothing a build
 * compiles changed: docs only, or test files only.
 */
export function buildFilters(scope) {
  if (scope.mode === 'full') return null;
  if (scope.mode === 'none' || scope.testsOrDocsOnly) return [];
  return turboFilters(scope.packages);
}

/** One line for the step log saying what the scope is and why. */
export function describeScope(scope, filters) {
  if (filters === null) return `all packages (${scope.mode}: ${scope.reason})`;
  if (filters.length === 0) return `nothing to do (${scope.mode}: ${scope.reason})`;
  return `${filters.join(' ')} (${scope.reason})`;
}

/**
 * Pre-ship's library-build step for a resolved scope. Turbo is spawned through
 * node (no shell); `spawn` is spawnSync-shaped. Returns the exit status.
 * @param {{scope: object, root: string, spawn: Function, execPath?: string,
 *          log?: (s: string) => void}} opts
 */
export function runLibraryBuild({
  scope,
  root,
  spawn,
  execPath = process.execPath,
  log = console.log,
}) {
  const filters = libraryBuildFilters(scope);
  log(`library-build: scope ${describeScope(scope, filters)}`);
  if (Array.isArray(filters) && filters.length === 0) return 0;
  const args = ['run', 'build', ...(filters ?? APP_PACKAGES.map((p) => `--filter=!${p}`))];
  log(`library-build: turbo ${args.join(' ')}`);
  const r = spawn(execPath, [path.join(root, 'node_modules', 'turbo', 'bin', 'turbo'), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.error) log(`library-build: could not start turbo: ${r.error.message}`);
  return r.status ?? 1;
}
