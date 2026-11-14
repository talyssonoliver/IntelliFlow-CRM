import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import setup, { bareLeak, guard, readCoreBare } from '../lib/git-bare-guard.mjs';
import { gitEnv } from '../lib/preship-git.mjs';

describe('git-bare-guard (globalSetup)', () => {
  it('fails the run when a test turned core.bare on, and says how to fix it', () => {
    const message = bareLeak('false', 'true');
    expect(message).toContain('core.bare=true');
    expect(message).toContain('gitEnv(process.env)');
  });

  it('passes when core.bare stayed off, or was already on before the run', () => {
    expect(bareLeak('false', 'false')).toBeNull();
    expect(bareLeak('', '')).toBeNull();
    expect(bareLeak('true', 'true')).toBeNull();
  });

  it('teardown throws when the reader saw core.bare flip on, and is quiet otherwise', () => {
    const values = ['false', 'true'];
    const flipped = guard(() => values.shift() ?? '');
    expect(() => flipped()).toThrow(/core\.bare=true/);
    const steady = guard(() => 'false');
    expect(() => steady()).not.toThrow();
  });

  it('the default export arms a guard and returns its teardown', () => {
    expect(typeof setup()).toBe('function');
  });
});

describe('readCoreBare', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Only a decoy repository is ever read or written here, never the real one.
  it('reads core.bare of the repository git resolves, and "" outside one', () => {
    const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-guard-decoy-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-guard-none-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: decoy, env: gitEnv(process.env) });
      vi.stubEnv('GIT_DIR', path.join(decoy, '.git'));
      expect(readCoreBare(decoy)).toBe('false');
      vi.stubEnv('GIT_DIR', path.join(outside, 'missing', '.git'));
      expect(readCoreBare(outside)).toBe('');
    } finally {
      fs.rmSync(decoy, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
