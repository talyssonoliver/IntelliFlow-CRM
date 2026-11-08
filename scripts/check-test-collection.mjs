#!/usr/bin/env node
/**
 * Fails when a tracked test file is collected by no vitest project and is not allowlisted
 * (#1216 item 2). Thin entry point: runs `vitest list --filesOnly` and `git ls-files`, and
 * hands both to scripts/lib/test-collection.mjs.
 *
 *   node scripts/check-test-collection.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowlistProblems, compareCollection, toRepoPath } from './lib/test-collection.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = path.join(REPO_ROOT, 'tools/scripts/test-collection.allowlist.json');

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-collection-'));
const outFile = path.join(outDir, 'collected.json');
try {
  // vitest's own entry under this Node: no shell, so no argument is ever concatenated.
  const vitest = path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  execFileSync(process.execPath, [vitest, 'list', '--filesOnly', `--json=${outFile}`], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const collectedFiles = JSON.parse(fs.readFileSync(outFile, 'utf8')).map((e) =>
    toRepoPath(e.file, REPO_ROOT)
  );
  const trackedFiles = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8')).entries;

  const problems = allowlistProblems(allowlist, (f) => fs.existsSync(path.join(REPO_ROOT, f)));
  const { uncollected, stale, allowlisted } = compareCollection({
    trackedFiles,
    collectedFiles,
    allowlist,
  });

  console.log(
    `check-test-collection: ${collectedFiles.length} collected, ${allowlisted} allowlisted, ` +
      `${uncollected.length} uncollected`
  );
  for (const file of uncollected) console.log(`  ✗ not collected by any vitest project: ${file}`);
  for (const entry of stale)
    console.log(`  ✗ allowlist entry matches no uncollected file: ${entry}`);
  for (const problem of problems) console.log(`  ✗ allowlist: ${problem}`);

  if (uncollected.length || stale.length || problems.length) {
    console.error(
      '::error::Collect the file in a vitest project, delete it (naming its live twin), or ' +
        'allowlist it with a reason and a ref in tools/scripts/test-collection.allowlist.json.'
    );
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
