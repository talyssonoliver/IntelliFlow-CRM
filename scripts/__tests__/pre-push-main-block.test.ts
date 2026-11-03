import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('.husky/pre-push main block', () => {
  let dir: string;

  // A copy with an empty husky.sh: `.husky/_` only exists after `husky install`.
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pre-push-'));
    mkdirSync(join(dir, '_'));
    writeFileSync(join(dir, '_', 'husky.sh'), '');
    copyFileSync(resolve(__dirname, '../../.husky/pre-push'), join(dir, 'pre-push'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const push = (remoteRef: string) =>
    spawnSync('sh', ['-e', join(dir, 'pre-push').replace(/\\/g, '/')], {
      input: `refs/heads/some-branch ${'a'.repeat(40)} ${remoteRef} ${'b'.repeat(40)}\n`,
      encoding: 'utf8',
    });

  it('blocks a push to main before any gate runs', () => {
    const result = push('refs/heads/main');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Direct push to main is blocked');
    expect(result.stderr).not.toContain('running pre-ship gate');
  });

  it('lets a push to a non-branch ref through', () => {
    expect(push('refs/tags/v1').status).toBe(0);
  });
});
