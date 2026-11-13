/**
 * The artifact linter's secret scan must leave the semantic review's local files
 * alone: scripts/codex-review.mjs writes prompts that embed the branch's diff into
 * artifacts/codex-review/, and a diff that removes a password-shaped line used to
 * fail the gate there. gitleaks scans the pushed commits themselves.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { ArtifactPathLinter, CONFIG } from '../artifact-paths';

type Internals = {
  isExcludedFromSecretScan(file: string): boolean;
  scanForSecrets(file: string): Promise<Array<{ message: string }>>;
};
const internals = (linter: ArtifactPathLinter) => linter as unknown as Internals;

describe('artifact-paths secret scan exclusions', () => {
  const linter = internals(new ArtifactPathLinter());

  it('lists artifacts/codex-review', () => {
    expect(CONFIG.secretScanExclusions).toContain('artifacts/codex-review/**');
  });

  it.each([
    'artifacts/codex-review/codex-prompt.txt',
    'artifacts/codex-review/codex-prompt-3.txt',
    'artifacts/codex-review/codex-raw-1.txt',
    'artifacts/codex-review/review-cache.json',
    'artifacts\\codex-review\\codex-prompt.txt',
  ])('skips %s', (file) => {
    expect(linter.isExcludedFromSecretScan(file)).toBe(true);
  });

  it.each([
    'artifacts/misc/settings.json',
    'apps/api/src/config.ts',
    'artifacts/codex-reviewer.txt',
  ])('still scans %s', (file) => {
    expect(linter.isExcludedFromSecretScan(file)).toBe(false);
  });
});

describe('a codex prompt that quotes a removed password line', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-secret-'));
  const config = CONFIG as { rootDir: string };
  const rootDir = config.rootDir;
  afterAll(() => {
    config.rootDir = rootDir;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('is reported outside artifacts/codex-review and not inside it', async () => {
    config.rootDir = tmp;
    // Built from parts so no credential-shaped literal sits in this source file.
    const line = ['-  pass', 'word: "', 'x'.repeat(12), '",'].join('');
    const prompt = ['Here is the actual diff to review:', '', '```diff', line, '```', ''].join(
      '\n'
    );
    for (const dir of ['artifacts/codex-review', 'artifacts/misc']) {
      fs.mkdirSync(path.join(tmp, dir), { recursive: true });
      fs.writeFileSync(path.join(tmp, dir, 'codex-prompt.txt'), prompt);
    }
    const linter = internals(new ArtifactPathLinter());
    const outside = await linter.scanForSecrets('artifacts/misc/codex-prompt.txt');
    const inside = await linter.scanForSecrets('artifacts/codex-review/codex-prompt.txt');
    expect(outside.length).toBeGreaterThan(0);
    expect(inside).toEqual([]);
  });
});
