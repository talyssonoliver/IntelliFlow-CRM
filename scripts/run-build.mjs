#!/usr/bin/env node
/**
 * Pre-ship's build step (see scripts/lib/preship-build.mjs, #1111).
 *
 *   local → turbo run build --concurrency=1 [--filter=<affected>...], capped Next workers and heap
 *   CI    → pnpm run build
 *
 * Locally only the packages the branch changed and their dependents are built,
 * and nothing when only docs or test files changed (scripts/lib/preship-affected.mjs);
 * PRESHIP_FULL_BUILD=1 builds everything.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './lib/preship-build.mjs';
import { affectedFromEnvOrResolve, buildFilters, describeScope } from './lib/preship-affected.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const scope = affectedFromEnvOrResolve({ cwd: root, env: process.env });
const filters = buildFilters(scope);
console.log(`build: scope ${describeScope(scope, filters)}`);
process.exit(runBuild({ isCI, env: process.env, root, filters }));
