#!/usr/bin/env node
/**
 * Diff-coverage gate — mirrors SonarCloud's `new_coverage` (>= 80% of changed
 * lines covered) locally. Runs AFTER the coverage step in pre-ship (it needs the
 * lcov to exist). The logic lives in ./lib/diff-coverage.mjs; this entry point
 * only wires in git, the filesystem and the exit code.
 *
 * Exit: 0 meets the floor (or no coverable changed lines) · 1 below floor / no lcov.
 *
 * Env:
 *   DIFF_COVER_MIN     coverage floor, default 80 (matches Sonar new_coverage)
 *   DIFF_COVER_BASE    base ref, default origin/main
 *   DIFF_COVER_LCOV    lcov path, default artifacts/coverage/lcov.info
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runDiffCoverage } from './lib/diff-coverage.mjs';
import { loadSonarScope } from './lib/sonar-scope.mjs';

const sh = (cmd, args) =>
  spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });

const top = sh('git', ['rev-parse', '--show-toplevel']);
const root = (top.status === 0 ? top.stdout.trim() : process.cwd()).replace(/\\/g, '/');

process.exit(
  runDiffCoverage({
    root,
    scope: loadSonarScope(root),
    env: process.env,
    sh,
    readFile: (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null),
    log: console.log,
    error: console.error,
  })
);
