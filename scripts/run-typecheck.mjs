#!/usr/bin/env node
/**
 * Pre-ship's typecheck step (see scripts/lib/preship-typecheck.mjs, #1100).
 *
 *   local → turbo run typecheck --concurrency=<n>, then pnpm run lint:sonar:guard
 *   CI    → turbo run typecheck,                  then pnpm run lint:sonar:guard
 *
 * Usage: node scripts/run-typecheck.mjs
 * Env:   PRESHIP_TYPECHECK_CONCURRENCY=<n> sets the local turbo concurrency (default 3).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTypecheck } from './lib/preship-typecheck.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isCI = process.env.CI === 'true' || process.env.CI === '1';
process.exit(runTypecheck({ isCI, env: process.env, root }));
