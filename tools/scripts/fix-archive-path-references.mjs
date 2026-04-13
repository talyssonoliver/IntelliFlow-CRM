#!/usr/bin/env node
/**
 * Second-pass CSV cleanup: remove the 9 stale `artifacts/old/*` references
 * written in the first pass. The project-tracker's artifact scanner
 * explicitly skips `artifacts/old/` (see `SKIP_PATH_PREFIXES` in
 * apps/project-tracker/lib/artifact-registry.ts:463), so pointing the CSV
 * at archived paths just recreates the missing-file warning.
 *
 * Attestations for these tasks already captured the original artifact
 * hashes before archival, so removing the tracker entry does not lose
 * evidence — it just stops the tracker from re-flagging a file it is
 * intentionally configured to ignore.
 */
import fs from 'node:fs';
import Papa from 'papaparse';

const CSV_PATH = 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv';
const COLS = ['Artifacts To Track', 'Pre-requisites'];

const DROPS = {
  'IFC-017': ['ARTIFACT:artifacts/old/benchmarks/query-performance.csv'],
  'IFC-021': ['ARTIFACT:artifacts/old/agent-interaction-logs.json'],
  'IFC-027': ['ARTIFACT:artifacts/old/ai-roi-report.md'],
  'IFC-044': ['ARTIFACT:artifacts/old/mutation-test.json'],
  'IFC-143': ['ARTIFACT:artifacts/old/mitigation-backlog.csv'],
  'IFC-146': ['ARTIFACT:artifacts/old/backlog-updates-log.csv'],
  'IFC-154': ['ARTIFACT:artifacts/old/benchmarks/ocr-quality-benchmarks.csv'],
  'IFC-155': ['ARTIFACT:artifacts/old/benchmarks/ocr-quality-benchmarks.csv'],
  'IFC-174': ['ARTIFACT:artifacts/old/ollama-real-benchmark-report.json'],
  'DOC-007': ['ARTIFACT:artifacts/old/accessibility-audit-results.json'],
};

function dropEntry(text, entry) {
  if (!text) return { text, dropped: false };
  for (const candidate of [`;${entry}`, `${entry};`, entry]) {
    if (text.includes(candidate)) {
      return { text: text.replace(candidate, ''), dropped: true };
    }
  }
  return { text, dropped: false };
}

const raw = fs.readFileSync(CSV_PATH, 'utf8');
const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
let touched = 0;
let ops = 0;

for (const row of parsed.data) {
  const id = row['Task ID'];
  if (!DROPS[id]) continue;
  let rowOps = 0;
  for (const entry of DROPS[id]) {
    for (const col of COLS) {
      const { text, dropped } = dropEntry(row[col] ?? '', entry);
      if (dropped) {
        row[col] = text;
        rowOps++;
      }
    }
  }
  if (rowOps > 0) {
    console.log(`[${id}] ${rowOps} entry removed`);
    touched++;
    ops += rowOps;
  }
}

const out = Papa.unparse(parsed.data, { columns: parsed.meta.fields, newline: '\n' });
fs.writeFileSync(CSV_PATH, out.replace(/\r?\n*$/, '\n'), 'utf8');
console.log(`\n✓ ${touched} rows touched, ${ops} ops applied`);
