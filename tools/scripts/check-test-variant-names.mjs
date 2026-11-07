#!/usr/bin/env node
/**
 * check-test-variant-names (#1216 item 5)
 *
 * Refuses NEW test files named as coverage variants of another file:
 * `*.supplementary*`, `*.additional*`, `*.b11`-style, `*.batch*` and `*.coverage` test files.
 * Tests for a unit belong in that unit's test file; variant files split one unit's tests
 * across many files and hide what is already covered (the 06/11/2026 audit found ~4,000
 * tests in 146 of them). Existing variant files are left alone; #1216 item 4 merges them.
 *
 * New = added (or renamed into) on this branch since origin/main, or staged as added.
 *
 * Usage: node tools/scripts/check-test-variant-names.mjs [--base origin/main]
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** `x.supplementary.test.ts`, `x.supplementary2.test.ts`, `x.b11.test.ts`, `x.batch10r.test.ts`… */
export const VARIANT_TEST_FILE =
  /\.(supplementary\d*|additional\d*|b\d+|batch\d+[a-z]*|coverage\d*)\.(test|spec)\.[cm]?[jt]sx?$/i;

/** The paths among `paths` whose file name is a variant test file. */
export function variantTestFiles(paths) {
  return paths.filter((p) => VARIANT_TEST_FILE.test(path.posix.basename(p.replaceAll('\\', '/'))));
}

function gitLines(args) {
  const out = execFileSync('git', args, { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Files added or renamed in on this branch since `base`, plus staged additions. */
export function newFiles(base) {
  return [
    ...new Set([
      ...gitLines(['diff', '--name-only', '-M', '--diff-filter=AR', `${base}...HEAD`]),
      ...gitLines(['diff', '--cached', '--name-only', '-M', '--diff-filter=AR']),
    ]),
  ];
}

function main() {
  const at = process.argv.indexOf('--base');
  const base = at === -1 ? 'origin/main' : process.argv[at + 1];
  const offending = variantTestFiles(newFiles(base));
  if (offending.length === 0) {
    console.log('test-variant-names: no new variant test files');
    return;
  }
  console.error('test-variant-names: new coverage-variant test files are not accepted (#1216):');
  for (const file of offending) console.error(`  ${file}`);
  console.error("  Add these tests to the unit's own test file instead.");
  process.exitCode = 1;
}

// CLI entry point guard: importing this module from a test must not run main().
if (process.argv[1]?.replaceAll('\\', '/').endsWith('tools/scripts/check-test-variant-names.mjs')) {
  main();
}
