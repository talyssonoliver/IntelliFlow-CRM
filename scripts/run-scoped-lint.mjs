#!/usr/bin/env node
/**
 * Pre-ship's format-check, lint and lint-promises steps, scoped to the files
 * this branch changed (see scripts/lib/preship-lint-scope.mjs).
 *
 *   node scripts/run-scoped-lint.mjs format     # prettier --check on changed files
 *   node scripts/run-scoped-lint.mjs lint       # each package's eslint on its changed files
 *   node scripts/run-scoped-lint.mjs promises   # type-aware no-floating-promises on changed files
 *
 * Under CI, with PRESHIP_FULL_LINT=1, or when a lint/format config file changed,
 * each mode runs the original repo-wide command instead (`pnpm run format:check`,
 * `pnpm run lint`, `pnpm run lint:promises`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  chunkArgs,
  formatTargets,
  lintPlan,
  promisesPlan,
  resolveLintScope,
} from './lib/preship-lint-scope.mjs';
import { readWorkspacePackages } from './ci/affected.mjs';

const WIN = process.platform === 'win32';
const MODES = new Set(['format', 'lint', 'promises']);
const FULL_COMMAND = {
  format: ['run', 'format:check'],
  lint: ['run', 'lint'],
  promises: ['run', 'lint:promises'],
};

/** Quote one argument for cmd.exe when the spawn goes through a shell. */
function q(arg) {
  return WIN ? `"${arg}"` : arg;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, WIN ? args.map(q) : args, { cwd, stdio: 'inherit', shell: WIN });
  if (r.error) console.error(`[scoped-lint] ${cmd} failed to start: ${r.error.message}`);
  return r.status ?? 1;
}

function repoRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : process.cwd();
}

function packagesWithLint(root) {
  return readWorkspacePackages(root).map((p) => {
    const json = JSON.parse(fs.readFileSync(path.join(root, p.dir, 'package.json'), 'utf8'));
    return { name: p.name, dir: p.dir, lint: json.scripts?.lint };
  });
}

export function runFormat(root, files) {
  const targets = formatTargets(files).filter((f) => fs.existsSync(path.join(root, f)));
  if (targets.length === 0) {
    console.log('[scoped-lint] format: no formattable files changed');
    return 0;
  }
  console.log(`[scoped-lint] format: prettier --check on ${targets.length} changed file(s)`);
  let status = 0;
  for (const chunk of chunkArgs(targets)) {
    // --ignore-unknown and .prettierignore apply as they do to the repo-wide glob.
    status |= run('pnpm', ['exec', 'prettier', '--check', '--ignore-unknown', ...chunk], root);
  }
  return status;
}

export function runLint(root, files) {
  const plan = lintPlan(files, packagesWithLint(root));
  if (plan.eslint.length === 0 && plan.whole.length === 0) {
    console.log('[scoped-lint] lint: no file a package lint script covers changed');
    return 0;
  }
  let status = 0;
  for (const pkg of plan.eslint) {
    console.log(`[scoped-lint] lint: ${pkg.name} — ${pkg.files.length} changed file(s)`);
    for (const chunk of chunkArgs(pkg.files)) {
      status |= run(
        'pnpm',
        ['exec', 'eslint', '--no-warn-ignored', ...chunk],
        path.join(root, pkg.dir)
      );
    }
  }
  for (const name of plan.whole) {
    console.log(
      `[scoped-lint] lint: ${name} — its lint script is not plain eslint; running it whole`
    );
    status |= run('pnpm', ['--filter', name, 'run', 'lint'], root);
  }
  return status;
}

export async function runPromises(root, files) {
  const { SOURCE_ROOTS } = await import(
    new URL(`file:///${path.join(root, 'eslint.promises.config.mjs').replace(/\\/g, '/')}`).href
  );
  const plan = promisesPlan(files, SOURCE_ROOTS);
  if (plan.length === 0) {
    console.log('[scoped-lint] promises: no changed file under a type-aware source root');
    return 0;
  }
  let status = 0;
  for (const { root: srcRoot, files: rootFiles } of plan) {
    console.log(`[scoped-lint] promises: ${srcRoot} — ${rootFiles.length} changed file(s)`);
    for (const chunk of chunkArgs(rootFiles)) {
      status |= run(
        'pnpm',
        ['exec', 'eslint', '-c', 'eslint.promises.config.mjs', '--no-warn-ignored', ...chunk],
        root
      );
    }
  }
  if (status !== 0) console.error('[scoped-lint] promises: floating promises found');
  return status;
}

async function main() {
  const mode = process.argv[2];
  if (!MODES.has(mode)) {
    console.error('usage: node scripts/run-scoped-lint.mjs <format|lint|promises>');
    return 2;
  }
  const root = repoRoot();
  const scope = resolveLintScope({ cwd: root });
  console.log(`[scoped-lint] ${mode}: scope ${scope.scope} — ${scope.reason}`);
  if (scope.scope === 'full') return run('pnpm', FULL_COMMAND[mode], root);
  if (mode === 'format') return runFormat(root, scope.files);
  if (mode === 'lint') return runLint(root, scope.files);
  return runPromises(root, scope.files);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
