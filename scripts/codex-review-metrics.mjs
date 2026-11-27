#!/usr/bin/env node
/**
 * Summary of the semantic-review metrics: model rounds per PR (or branch), reviewers, findings by
 * severity, how many earlier findings had their code changed on the next push, and the cost.
 *
 *   node scripts/codex-review-metrics.mjs                 # artifacts/codex-review/metrics.jsonl
 *   node scripts/codex-review-metrics.mjs --file=<path>   # another file (or CODEX_REVIEW_METRICS_PATH)
 *   node scripts/codex-review-metrics.mjs --json          # the grouped numbers as JSON
 *
 * The record format and the logic are in scripts/lib/review-metrics.mjs. Codex runs on the ChatGPT
 * plan, so only Claude calls carry a price (the CLI's own estimate); tokens are shown when reported.
 */
import fs from 'node:fs';
import { runMetricsCli } from './lib/review-metrics.mjs';

process.exit(
  runMetricsCli({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    out: (s) => process.stdout.write(s),
  })
);
