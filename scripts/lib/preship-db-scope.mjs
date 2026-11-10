/**
 * Does this branch need the test database: the integration suite and the seed?
 *
 * A UI-only push used to seed a fresh test database and run the whole
 * integration suite, neither of which can see a change to a React component.
 * Locally they now run only when the change can reach them:
 *
 *   needed — under CI; with PRESHIP_FULL_DB=1; when the merge-base or the diff
 *            cannot be read; when a file under packages/db, apps/api,
 *            apps/ai-worker or tests/integration changed, or a file that
 *            configures the test run or the database (any package.json, the
 *            lockfile, vitest/vite/tsconfig, docker-compose, .env.test*, the
 *            Prisma schema, the test-db scripts); or when an integration test
 *            imports a changed file (`vitest list --changed <merge-base>
 *            --project integration`). A failed listing counts as needed.
 *   not needed — none of the above. CI still runs the full integration suite.
 *
 * "Changed" is everything that differs from the merge-base with origin/main:
 * committed, staged, unstaged, untracked and deleted files.
 */

import { spawnSync } from 'node:child_process';

export const DEFAULT_BASE_REF = 'origin/main';
export const FULL_DB_ENV = 'PRESHIP_FULL_DB';

/** Trees the integration suite exercises directly. */
export const DB_TREES = [
  /^packages\/db\//,
  /^apps\/api\//,
  /^apps\/ai-worker\//,
  /^tests\/integration\//,
];

/** Files that change how the test database is built or how tests resolve. */
export const DB_CONFIG = [
  /(^|\/)package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vitest\.[^/]+$/,
  /(^|\/)vite\.config\.[^/]+$/,
  /^docker-compose[^/]*\.ya?ml$/,
  /(^|\/)\.env\.test[^/]*$/,
  /\.prisma$/,
  /^scripts\/test-db\.mjs$/,
  /^scripts\/lib\/ephemeral-test-db\.mjs$/,
  /^scripts\/lib\/preship-db-scope\.mjs$/,
  /^scripts\/lib\/preship-integration-infra\.mjs$/,
];

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

/** Integration test files from `vitest list --filesOnly` output (`[integration] path`). */
export function parseListedTests(stdout) {
  return (stdout || '')
    .split(/\r?\n/)
    .map((l) => /^\[integration\]\s+(\S.*)$/.exec(l.trim())?.[1])
    .filter(Boolean);
}

/**
 * The integration tests that import a file changed since `base`, or null when
 * vitest could not list them.
 */
function defaultListIntegration(base, cwd, env) {
  const r = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'list', '--changed', base, '--project', 'integration', '--filesOnly'],
    {
      cwd,
      env: gitEnv(env),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    }
  );
  return r.status === 0 ? parseListedTests(r.stdout) : null;
}

function lines(out) {
  return (out || '')
    .split('\n')
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

const NEEDED = (reason, tests = []) => ({ needed: true, reason, tests });

/**
 * @param {{cwd: string, env?: NodeJS.ProcessEnv, baseRef?: string,
 *          git?: (args: string[], cwd: string, env: object) => string | null,
 *          listIntegration?: (base: string, cwd: string, env: object) => string[] | null}} opts
 * @returns {{needed: boolean, reason: string, tests: string[]}}
 */
export function resolveDbScope({
  cwd,
  env = process.env,
  baseRef = DEFAULT_BASE_REF,
  git = defaultGit,
  listIntegration = defaultListIntegration,
}) {
  if (env.CI === 'true' || env.CI === '1') return NEEDED('CI runs the integration suite');
  if (env[FULL_DB_ENV] === '1') return NEEDED(`${FULL_DB_ENV}=1`);
  const base = (git(['merge-base', 'HEAD', baseRef], cwd, env) || '').trim();
  if (!base) return NEEDED(`cannot resolve merge-base with ${baseRef}`);
  // `vitest list --changed <ref>` exits 0 with an empty list for a ref that does
  // not exist, which would read as "nothing reaches the DB". Prove the base first.
  if (git(['cat-file', '-e', `${base}^{commit}`], cwd, env) === null) {
    return NEEDED(`merge-base ${base} is not a commit`);
  }
  const tracked = git(['diff', '--name-only', base], cwd, env);
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd, env);
  if (tracked === null || untracked === null) return NEEDED('git diff failed');
  const changed = [...new Set([...lines(tracked), ...lines(untracked)])];

  const tree = changed.find((f) => DB_TREES.some((re) => re.test(f)));
  if (tree) return NEEDED(`${tree} changed`);
  const config = changed.find((f) => DB_CONFIG.some((re) => re.test(f)));
  if (config) return NEEDED(`${config} changed`);
  if (changed.length === 0) return { needed: false, reason: 'no file changed', tests: [] };

  const tests = listIntegration(base, cwd, env);
  if (tests === null) return NEEDED('could not list the integration tests the diff reaches');
  if (tests.length > 0) {
    return NEEDED(`${tests.length} integration test(s) import a changed file`, tests);
  }
  return {
    needed: false,
    reason: `no integration test imports any of the ${changed.length} changed file(s)`,
    tests: [],
  };
}
