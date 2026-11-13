/**
 * Tests for scripts/lib/preship-git.mjs — the git plumbing pre-ship's scope
 * resolvers share.
 */
import { describe, it, expect, vi } from 'vitest';

import { gitEnv, nonEmptyLines, runGit } from '../lib/preship-git.mjs';

describe('gitEnv', () => {
  it('drops every GIT_* variable and keeps the rest', () => {
    expect(gitEnv({ GIT_DIR: '/x/.git', GIT_INDEX_FILE: 'i', PATH: 'p', HOME: 'h' })).toEqual({
      PATH: 'p',
      HOME: 'h',
    });
  });

  it('does not change the env it was given', () => {
    const env = { GIT_DIR: 'd' };
    gitEnv(env);
    expect(env).toEqual({ GIT_DIR: 'd' });
  });
});

describe('runGit', () => {
  it('returns stdout on success, run in cwd without GIT_* variables', () => {
    const spawn = vi.fn(() => ({ status: 0, stdout: 'abc\n' }));
    expect(runGit(['rev-parse', 'HEAD'], '/repo', { GIT_DIR: 'd', PATH: 'p' }, spawn)).toBe(
      'abc\n'
    );
    const [bin, args, opts] = spawn.mock.calls[0];
    expect(bin).toBe('git');
    expect(args).toEqual(['rev-parse', 'HEAD']);
    expect(opts).toMatchObject({ cwd: '/repo', env: { PATH: 'p' }, encoding: 'utf8' });
  });

  it('returns null when git fails', () => {
    expect(runGit(['x'], '.', {}, () => ({ status: 128, stdout: '' }))).toBeNull();
  });

  it('runs the real git by default', () => {
    expect(runGit(['rev-parse', '--is-inside-work-tree'], process.cwd(), process.env)?.trim()).toBe(
      'true'
    );
  });
});

describe('nonEmptyLines', () => {
  it('trims and drops blank lines', () => {
    expect(nonEmptyLines(' a \n\n b\r\n  \n')).toEqual(['a', 'b']);
  });

  it('reads null and undefined as empty', () => {
    expect(nonEmptyLines(null)).toEqual([]);
    expect(nonEmptyLines(undefined)).toEqual([]);
  });
});
