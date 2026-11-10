#!/usr/bin/env node
/**
 * Pre-ship's library-build step: the library packages typecheck and the tests
 * read from dist/.
 *
 *   full     → turbo run build over every package except the four apps
 *   affected → turbo run build for the affected libraries and the dependencies
 *              of each affected app (scripts/lib/preship-affected.mjs)
 *   none     → nothing (docs, e2e or property tests only)
 *
 * Turbo's local cache is on, so unchanged libraries are restored, not rebuilt.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  affectedFromEnvOrResolve,
  APP_PACKAGES,
  describeScope,
  libraryBuildFilters,
} from './lib/preship-affected.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scope = affectedFromEnvOrResolve({ cwd: root, env: process.env });
const filters = libraryBuildFilters(scope);
console.log(`library-build: scope ${describeScope(scope, filters)}`);
if (Array.isArray(filters) && filters.length === 0) process.exit(0);
const args = ['run', 'build', ...(filters ?? APP_PACKAGES.map((p) => `--filter=!${p}`))];
console.log(`library-build: turbo ${args.join(' ')}`);
const r = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules', 'turbo', 'bin', 'turbo'), ...args],
  { cwd: root, stdio: 'inherit' }
);
if (r.error) console.error(`library-build: could not start turbo: ${r.error.message}`);
process.exit(r.status ?? 1);
