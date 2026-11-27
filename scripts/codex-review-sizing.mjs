#!/usr/bin/env node
/**
 * Dry-run classification of a diff: which review tier the gate would pick, and why. Calls NO model
 * and writes nothing. Use it to see what a past PR would have cost.
 *
 *   node scripts/codex-review-sizing.mjs <base>...<head> [<base>...<head> ...]
 *   node scripts/codex-review-sizing.mjs --pr=<sha>        # the squash commit <sha>^..<sha>
 *
 * The gate's own scope rules (sonar.sources) are not applied here: the table counts every changed
 * code file, which is what sizes the review for a PR that touches only in-scope sources.
 * The rules are in scripts/lib/review-tier.mjs.
 */
import { spawnSync } from 'node:child_process';
import { sizeRange, sizingRanges } from './lib/review-tier.mjs';

const git = (args) => {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
};

const ranges = sizingRanges(process.argv.slice(2));
if (ranges.length === 0) {
  process.stderr.write('usage: codex-review-sizing.mjs <base>...<head> [...] | --pr=<sha>\n');
  process.exit(2);
}
process.stdout.write(
  `${JSON.stringify(
    ranges.map((r) => sizeRange(r, git)),
    null,
    2
  )}\n`
);
