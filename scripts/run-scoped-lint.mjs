#!/usr/bin/env node
/**
 * CLI for pre-ship's format-check, lint and lint-promises steps, scoped to the
 * files this branch changed. Wiring only: the logic and its tests are in
 * scripts/lib/preship-lint-scope.mjs.
 *
 *   node scripts/run-scoped-lint.mjs format|lint|promises
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { lintScopeFor, runScopedLint } from './lib/preship-lint-scope.mjs';
import { readWorkspacePackages } from './ci/affected.mjs';

const WIN = process.platform === 'win32';
const mode = process.argv[2];
if (!['format', 'lint', 'promises'].includes(mode)) {
  console.error('usage: node scripts/run-scoped-lint.mjs <format|lint|promises>');
  process.exit(2);
}
const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
const root = git.status === 0 ? git.stdout.trim() : process.cwd();

// pnpm resolves through cmd.exe on Windows, so each argument is quoted there.
const run = (cmd, args, cwd) => {
  const argv = WIN ? args.map((a) => `"${a}"`) : args;
  const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit', shell: WIN });
  if (r.error) console.error(`[scoped-lint] ${cmd} failed to start: ${r.error.message}`);
  return r.status ?? 1;
};

const status = await runScopedLint(mode, lintScopeFor(mode, { cwd: root }), {
  root,
  run,
  log: (line) => console.log(line),
  exists: (f) => fs.existsSync(path.join(root, f)),
  packages: () =>
    readWorkspacePackages(root).map((p) => ({
      name: p.name,
      dir: p.dir,
      lint: JSON.parse(fs.readFileSync(path.join(root, p.dir, 'package.json'), 'utf8')).scripts
        ?.lint,
    })),
  promiseRoots: async () =>
    (await import(pathToFileURL(path.join(root, 'eslint.promises.config.mjs')).href)).SOURCE_ROOTS,
});
process.exit(status);
