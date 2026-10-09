#!/usr/bin/env node
// Runs the type-aware no-floating-promises lint (eslint.promises.config.mjs) one
// source root at a time.
//
// A single eslint run over every root builds one TypeScript program for the
// whole monorepo and exhausts the 4 GB heap CI gives node. One root per run
// keeps each program small; every root still runs, and the exit code is
// non-zero if any of them reports a problem.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { SOURCE_ROOTS } from '../eslint.promises.config.mjs';

// Run eslint's own bin with this node: no shell, so nothing is concatenated.
const require = createRequire(import.meta.url);
const ESLINT_BIN = path.join(
  path.dirname(require.resolve('eslint/package.json')),
  'bin',
  'eslint.js'
);

const failed = [];
for (const root of SOURCE_ROOTS) {
  console.log(`\n[lint:promises] ${root}`);
  const result = spawnSync(
    process.execPath,
    [ESLINT_BIN, '-c', 'eslint.promises.config.mjs', '--no-warn-ignored', root],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) failed.push(root);
}

if (failed.length > 0) {
  console.error(`\n[lint:promises] failed in: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('\n[lint:promises] no floating promises');
