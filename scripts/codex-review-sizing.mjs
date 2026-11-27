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
 */
import { spawnSync } from 'node:child_process';
import { parseNumstat, classifyDiff, modelForTier } from './lib/review-tier.mjs';

const git = (args) => {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
};

const ranges = process.argv
  .slice(2)
  .map((a) => (a.startsWith('--pr=') ? `${a.slice(5)}^..${a.slice(5)}` : a));
if (ranges.length === 0) {
  process.stderr.write('usage: codex-review-sizing.mjs <base>...<head> [...] | --pr=<sha>\n');
  process.exit(2);
}

const rows = [];
for (const range of ranges) {
  const stats = parseNumstat(git(['diff', '--numstat', '--no-renames', range]));
  // Comment-only detection needs the diff text of the code files.
  const sizing0 = classifyDiff(stats);
  const sections = [];
  if (sizing0.tier !== 'skip') {
    const code = stats.map((s) => s.file);
    const text = git(['diff', '--no-color', '--no-ext-diff', '--no-renames', range, '--', ...code]);
    for (const part of text.split(/^(?=diff --git )/m).filter(Boolean)) {
      const m = /^\+\+\+ b\/(.+)$/m.exec(part) || /^--- a\/(.+)$/m.exec(part);
      if (m) sections.push({ file: m[1].trimEnd(), text: part });
    }
  }
  const sizing = classifyDiff(stats, sections);
  const model = modelForTier(sizing.tier);
  rows.push({
    range,
    files: stats.length,
    lines: sizing.lines,
    kinds: Object.entries(sizing.kinds)
      .map(([k, n]) => `${n} ${k}`)
      .join(', '),
    tier: sizing.tier,
    risky: sizing.risky,
    reviewer: sizing.tier === 'skip' ? 'none' : `codex ${model.model}/${model.effort}`,
    reason: sizing.reason,
  });
}
process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
