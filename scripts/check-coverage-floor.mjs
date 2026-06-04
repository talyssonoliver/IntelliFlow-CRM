#!/usr/bin/env node
/**
 * Coverage ratchet-floor gate — the REAL coverage gate, shared by CI and
 * pre-ship so the laptop predicts CI exactly (single source of truth).
 *
 * Reads artifacts/coverage/coverage-summary.json (Istanbul json-summary) and
 * asserts total coverage meets the floor. This is a RATCHET FLOOR at today's
 * measured coverage, NOT the aspirational 90/80/90/90 in vitest.config.ts
 * (which was documented-but-unenforced — ADR-058). It blocks REGRESSION below
 * the current level; raise the floor over time as coverage improves.
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

const DEFAULT_FLOOR = { statements: 78, branches: 70, functions: 75, lines: 80 };
const floor = Object.fromEntries(
  Object.entries(DEFAULT_FLOOR).map(([k, v]) => [
    k,
    Number(process.env[`COVERAGE_FLOOR_${k.toUpperCase()}`] ?? v),
  ])
);

const summaryPath = process.argv[2] || 'artifacts/coverage/coverage-summary.json';

if (!fs.existsSync(summaryPath)) {
  console.error(`::error::${summaryPath} missing — the coverage step failed to produce a report.`);
  process.exit(1);
}

let total;
try {
  total = JSON.parse(fs.readFileSync(summaryPath, 'utf8')).total;
} catch (e) {
  console.error(`::error::could not parse ${summaryPath}: ${e.message}`);
  process.exit(1);
}

let bad = false;
for (const k of Object.keys(floor)) {
  const pct = total?.[k]?.pct;
  if (typeof pct !== 'number') {
    console.error(`::error::coverage summary has no '${k}.pct'`);
    bad = true;
    continue;
  }
  const ok = pct >= floor[k];
  console.log(`${ok ? '✓' : '✗'} ${k}: ${pct}% (floor ${floor[k]}%)`);
  if (!ok) bad = true;
}

if (bad) {
  console.error('::error::Coverage is below the ratchet floor (78/70/75/80). See ADR-058.');
  process.exit(1);
}
console.log('✅ Coverage meets the ratchet floor.');
process.exit(0);
