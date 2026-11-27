#!/usr/bin/env node
/**
 * Summary of the semantic-review metrics: model rounds per PR (or branch), reviewers, findings by
 * severity, how many earlier findings had their code changed on the next push, and the cost.
 *
 *   node scripts/codex-review-metrics.mjs                 # artifacts/codex-review/metrics.jsonl
 *   node scripts/codex-review-metrics.mjs --file=<path>   # another file (or CODEX_REVIEW_METRICS_PATH)
 *   node scripts/codex-review-metrics.mjs --json          # the grouped numbers as JSON
 *
 * The record format is documented in scripts/lib/review-metrics.mjs. Codex runs on the ChatGPT plan,
 * so only Claude calls carry a price (the CLI's own estimate); tokens are shown when reported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { formatSummary, metricsPath, parseMetrics, summarize } from './lib/review-metrics.mjs';

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith('--file='))?.slice('--file='.length);
const root = process.cwd();
const file = fileArg || metricsPath(path.join(root, 'artifacts/codex-review'));

let text = '';
try {
  text = fs.readFileSync(file, 'utf8');
} catch {
  process.stdout.write(`No metrics file at ${file}.\n`);
  process.exit(0);
}
const groups = summarize(parseMetrics(text)).map((g) => ({
  ...g,
  reviewers: [...g.reviewers],
  models: [...g.models],
  last: undefined,
}));
if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify(groups, null, 2)}\n`);
} else {
  process.stdout.write(
    formatSummary(
      groups.map((g) => ({ ...g, reviewers: new Set(g.reviewers), models: new Set(g.models) }))
    )
  );
}
