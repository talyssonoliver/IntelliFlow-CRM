#!/usr/bin/env node
/**
 * Pre-ship's library-build step: the library packages typecheck and the tests
 * read from dist/, limited to what the branch affects. Wiring only: see
 * runLibraryBuild() in scripts/lib/preship-affected.mjs.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { affectedFromEnvOrResolve, runLibraryBuild } from './lib/preship-affected.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scope = affectedFromEnvOrResolve({ cwd: root, env: process.env });
process.exit(runLibraryBuild({ scope, root, spawn: spawnSync }));
