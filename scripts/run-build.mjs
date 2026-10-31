#!/usr/bin/env node
/**
 * Pre-ship's build step (see scripts/lib/preship-build.mjs, #1111).
 *
 *   local → turbo run build --concurrency=1, NEXT_BUILD_CPUS=2, a 4 GB heap
 *   CI    → pnpm run build
 *
 * Usage: node scripts/run-build.mjs
 * Env:   PRESHIP_NEXT_CPUS=<n>, PRESHIP_BUILD_HEAP_MB=<mb> override the local limits.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './lib/preship-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isCI = process.env.CI === 'true' || process.env.CI === '1';
process.exit(runBuild({ isCI, env: process.env, root }));
