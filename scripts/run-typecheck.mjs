#!/usr/bin/env node
/**
 * Pre-ship's typecheck step (see scripts/lib/preship-typecheck.mjs, #1100).
 *
 *   local → turbo run typecheck --concurrency=<n> [--filter=<affected>...], then pnpm run lint:sonar:guard
 *   CI    → turbo run typecheck, then pnpm run lint:sonar:guard
 *
 * Locally only the packages the branch changed and their dependents are
 * typechecked (scripts/lib/preship-affected.mjs); PRESHIP_FULL_BUILD=1 checks all.
 *
 * Usage: node scripts/run-typecheck.mjs
 * Env:   PRESHIP_TYPECHECK_CONCURRENCY=<n> sets the local turbo concurrency (default 3).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTypecheck } from './lib/preship-typecheck.mjs';
import {
  affectedFromEnvOrResolve,
  describeScope,
  typecheckFilters,
} from './lib/preship-affected.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const scope = affectedFromEnvOrResolve({ cwd: root, env: process.env });
const filters = typecheckFilters(scope);
console.log(`typecheck: scope ${describeScope(scope, filters)}`);
process.exit(runTypecheck({ isCI, env: process.env, root, filters }));
