#!/usr/bin/env node
/**
 * Coverage ratchet-floor gate — the REAL coverage gate, shared by CI and
 * pre-ship so the laptop predicts CI exactly (single source of truth).
 *
 * Reads artifacts/coverage/coverage-summary.json (Istanbul json-summary) and
 * asserts PRODUCT coverage meets the floor. This is a RATCHET FLOOR at today's
 * measured coverage, NOT the aspirational 90/80/90/90 in vitest.config.ts
 * (which was documented-but-unenforced — ADR-058). It blocks REGRESSION below
 * the current level; raise the floor over time as coverage improves. Repo
 * tooling (scripts/, tools/) is reported but not floor-gated — see
 * ./lib/coverage-floor.mjs, where the logic lives.
 *
 * Floor (override per-key via env, e.g. COVERAGE_FLOOR_STATEMENTS=80):
 *   statements 78 · branches 70 · functions 75 · lines 80   (ADR-058)
 *
 * Usage:
 *   node scripts/check-coverage-floor.mjs [path-to-coverage-summary.json]
 *
 * Exit: 0 meets floor · 1 below floor or summary missing.
 */
import fs from 'node:fs';
import { resolveSummaryPath, runCoverageFloor } from './lib/coverage-floor.mjs';

const root = process.cwd();
let summaryPath;
try {
  summaryPath = resolveSummaryPath(process.argv[2], root);
} catch (e) {
  console.error(`::error::${e.message}`);
  process.exit(1);
}

process.exit(
  runCoverageFloor({
    summaryPath,
    root,
    env: process.env,
    readFile: (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null),
    log: console.log,
    error: console.error,
  })
);
