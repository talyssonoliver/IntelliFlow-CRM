/**
 * Local memory limits for pre-ship's build and test steps (#1111).
 *
 * On 2026-10-31 a full pre-ship was killed by the host's low-memory reaper during
 * `build`. A process sampler showed why: `next build --webpack` reached 5.7 GB with
 * at least nine page workers (Next defaults to one per CPU core less one), while
 * turbo built other packages alongside it. The push recipe's
 * NODE_OPTIONS=--max-old-space-size=8192 was inherited by every child, so heaps
 * grew far past need. Test processes, by contrast, plateaued at about 1 GB.
 *
 * Locally, therefore:
 * - the build runs `turbo run build --concurrency=1`, so the web build runs alone;
 * - NEXT_BUILD_CPUS caps Next's page workers (apps/web/next.config.js reads it),
 *   default 2, PRESHIP_NEXT_CPUS overrides it;
 * - the build's heap is capped at 4 GB, the value CI's workflows build with,
 *   PRESHIP_BUILD_HEAP_MB overrides it;
 * - the test steps drop an inherited --max-old-space-size from NODE_OPTIONS, so
 *   vitest's workers don't inherit it (run-coverage.js still gives the vitest
 *   main process its own explicit heap flag).
 * Under CI nothing changes: `pnpm run build` and the inherited environment.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const NEXT_CPUS_ENV = 'PRESHIP_NEXT_CPUS';
export const BUILD_HEAP_ENV = 'PRESHIP_BUILD_HEAP_MB';
export const DEFAULT_LOCAL_NEXT_CPUS = 2;
export const DEFAULT_LOCAL_BUILD_HEAP_MB = 4096;

const HEAP_FLAG = /(?:^|\s)--max[-_]old[-_]space[-_]size=\S*/g;

/**
 * NODE_OPTIONS without any --max-old-space-size flag (either spelling).
 * @param {string | undefined} nodeOptions
 * @returns {string}
 */
export function stripHeapCap(nodeOptions) {
  return (nodeOptions ?? '').replace(HEAP_FLAG, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A positive integer from an override, or the default when it is unset. A
 * malformed value throws rather than falling back, so a typo cannot quietly bring
 * the memory peak back.
 */
function positiveInt(env, name, fallback) {
  const raw = (env[name] ?? '').trim();
  if (raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

/**
 * The build step's command and the env it adds on top of the inherited one.
 * @param {{isCI: boolean, env: Record<string, string | undefined>}} opts
 * @returns {{bin: 'turbo' | 'pnpm', args: string[], env: Record<string, string>}}
 */
export function buildPlan({ isCI, env }) {
  if (isCI) return { bin: 'pnpm', args: ['run', 'build'], env: {} };
  const cpus = positiveInt(env, NEXT_CPUS_ENV, DEFAULT_LOCAL_NEXT_CPUS);
  const heapMb = positiveInt(env, BUILD_HEAP_ENV, DEFAULT_LOCAL_BUILD_HEAP_MB);
  const nodeOptions = [stripHeapCap(env.NODE_OPTIONS), `--max-old-space-size=${heapMb}`]
    .filter(Boolean)
    .join(' ');
  return {
    bin: 'turbo',
    args: ['run', 'build', '--concurrency=1'],
    env: { NEXT_BUILD_CPUS: String(cpus), NODE_OPTIONS: nodeOptions },
  };
}

/**
 * The env the unit-tests and coverage steps add: locally, NODE_OPTIONS without an
 * inherited heap cap. Empty when there is nothing to change, and under CI.
 * @param {{isCI: boolean, env: Record<string, string | undefined>}} opts
 * @returns {Record<string, string>}
 */
export function testStepEnv({ isCI, env }) {
  if (isCI) return {};
  const current = env.NODE_OPTIONS ?? '';
  const stripped = stripHeapCap(current);
  return stripped === current.trim() ? {} : { NODE_OPTIONS: stripped };
}

/**
 * Run the build step. Turbo is spawned through node directly (no shell); pnpm
 * needs a shell on win32 to resolve pnpm.cmd, and its arguments are fixed strings.
 * @returns {number} the step's exit code
 */
export function runBuild({
  isCI,
  env,
  root,
  spawn = spawnSync,
  log = console.log,
  logError = console.error,
  execPath = process.execPath,
  platform = process.platform,
}) {
  let plan;
  try {
    plan = buildPlan({ isCI, env });
  } catch (err) {
    logError(`build: ${err.message}`);
    return 1;
  }
  const extra = Object.entries(plan.env).map(([k, v]) => `${k}=${v}`);
  log(`build: ${[...extra, plan.bin, ...plan.args].join(' ')}`);
  const options = { cwd: root, stdio: 'inherit', env: { ...env, ...plan.env } };
  const r =
    plan.bin === 'turbo'
      ? spawn(
          execPath,
          [path.join(root, 'node_modules', 'turbo', 'bin', 'turbo'), ...plan.args],
          options
        )
      : spawn('pnpm', plan.args, { ...options, shell: platform === 'win32' });
  if (r.error) {
    logError(`build: could not start ${plan.bin}: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}
