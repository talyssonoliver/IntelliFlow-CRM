import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, expect } from 'vitest';
import { gitEnv } from '../lib/preship-git.mjs';

/**
 * Registers a guard: the shared repo's .git/config (the one every worktree reads) must be byte for
 * byte the same after the suite. A test that runs git with the hook's GIT_DIR / GIT_WORK_TREE once
 * wrote core.worktree and core.bare into it and broke every worktree (2026-11-27).
 */
export function guardSharedGitConfig(): void {
  let file = '';
  let before = '';
  beforeAll(() => {
    const r = spawnSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: gitEnv(process.env),
    });
    if (r.status !== 0) return;
    file = path.join(path.resolve(process.cwd(), r.stdout.trim()), 'config');
    before = fs.readFileSync(file, 'utf8');
  });
  afterAll(() => {
    if (file) expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
}
