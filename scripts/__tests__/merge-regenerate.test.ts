/**
 * artifacts/benchmarks/baseline.json no longer conflicts on a merge of main:
 * the `ifc-regenerated` driver keeps this side and the post-merge hook
 * regenerates it from the merged code (scripts/lib/merge-regenerate.mjs).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DRIVER,
  REGENERATED,
  REGENERATE_COMMANDS,
  hookIo,
  installMergeDrivers,
  regenerateAfterMerge,
} from '../lib/merge-regenerate.mjs';
import { runGit } from '../lib/preship-git.mjs';

const ROOT = path.resolve(__dirname, '..', '..');
const BASELINE = 'artifacts/benchmarks/baseline.json';

/** A fake git: answers by first argument(s), records every call. */
function fakeGit(answers: Record<string, string | null>) {
  const calls: string[][] = [];
  const git = (args: string[]) => {
    calls.push(args);
    const key = Object.keys(answers).find((k) => args.join(' ').startsWith(k));
    return key === undefined ? '' : answers[key];
  };
  return { git, calls };
}

describe('installMergeDrivers', () => {
  it('writes the driver when it is missing', () => {
    const { git, calls } = fakeGit({ 'config --get': null });
    expect(installMergeDrivers(git)).toBe(true);
    expect(calls).toContainEqual(['config', `merge.${DRIVER}.driver`, 'true']);
  });

  it('leaves an installed driver alone', () => {
    const { git, calls } = fakeGit({ 'config --get': 'true\n' });
    expect(installMergeDrivers(git)).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe('regenerateAfterMerge', () => {
  const ok = () => true;
  const no = () => false;

  it('does nothing after a fast-forward or a non-merge commit', () => {
    const { git } = fakeGit({ 'rev-parse': null });
    let ran = false;
    const regenerate = () => (ran = true);
    expect(regenerateAfterMerge({ git, regenerate, amend: ok })).toBe('not-a-merge');
    expect(ran).toBe(false);
  });

  it('reports a failed regeneration and leaves the merge as it is', () => {
    const { git, calls } = fakeGit({ 'rev-parse': 'abc' });
    const out: string[] = [];
    expect(regenerateAfterMerge({ git, regenerate: no, amend: ok, log: (s) => out.push(s) })).toBe(
      'regenerate-failed'
    );
    expect(calls.some((c) => c[0] === 'merge')).toBe(false);
    expect(out.join('')).toContain('the next commit will');
  });

  it('does not amend when the merged copy is already current', () => {
    const { git, calls } = fakeGit({ 'rev-parse': 'abc', diff: '' });
    expect(regenerateAfterMerge({ git, regenerate: ok, amend: no })).toBe('unchanged');
    expect(calls.some((c) => c[0] === 'merge')).toBe(false);
  });

  it('drops the merge state, stages the file and amends when it changed', () => {
    const { git, calls } = fakeGit({ 'rev-parse': 'abc', diff: null });
    expect(regenerateAfterMerge({ git, regenerate: ok, amend: ok })).toBe('amended');
    expect(calls).toContainEqual(['merge', '--quit']);
    expect(calls).toContainEqual(['add', '--', ...REGENERATED]);
  });

  it('says what to do when the amend fails', () => {
    const { git } = fakeGit({ 'rev-parse': 'abc', diff: null });
    const out: string[] = [];
    expect(regenerateAfterMerge({ git, regenerate: ok, amend: no, log: (s) => out.push(s) })).toBe(
      'amend-failed'
    );
    expect(out.join('')).toContain('Commit it before pushing');
  });
});

describe('hookIo', () => {
  it('runs the inventory commands, then amends without editing the message', () => {
    const spawned: Array<[string, unknown]> = [];
    const spawn = ((cmd: string, args: unknown) => {
      spawned.push([cmd, args]);
      return { status: 0, stdout: '' };
    }) as unknown as typeof import('node:child_process').spawnSync;
    const io = hookIo('/repo', {}, spawn);
    expect(io.regenerate()).toBe(true);
    expect(io.amend()).toBe(true);
    expect(spawned.map((s) => s[0])).toEqual([...REGENERATE_COMMANDS, 'git']);
    expect(spawned[2][1]).toEqual(['commit', '-q', '--amend', '--no-edit']);
  });

  it('stops at the first failing inventory command', () => {
    let n = 0;
    const spawn = (() => ({
      status: n++ === 0 ? 1 : 0,
    })) as unknown as typeof import('node:child_process').spawnSync;
    expect(hookIo('/repo', {}, spawn).regenerate()).toBe(false);
    expect(n).toBe(1);
  });
});

describe('a real merge with the driver', () => {
  it('merges without a conflict and folds the regenerated file into the merge commit', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-regen-'));
    const env = { ...process.env };
    const git = (args: string[]) => runGit(args, dir, env);
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    };
    try {
      git(['init', '-q', '-b', 'main']);
      git(['config', 'user.email', 'test@example.invalid']);
      git(['config', 'user.name', 'test']);
      git(['config', 'core.autocrlf', 'false']);
      git(['config', 'core.hooksPath', 'no-hooks']);
      expect(installMergeDrivers(git)).toBe(true);
      // The repo's own attribute line, so a change to it is tested here.
      const attr = fs
        .readFileSync(path.join(ROOT, '.gitattributes'), 'utf8')
        .split('\n')
        .find((l) => l.startsWith(BASELINE));
      write('.gitattributes', `${attr}\n`);
      write(BASELINE, '{"endpoints": 1}\n');
      git(['add', '.']);
      git(['commit', '-qm', 'base']);
      git(['checkout', '-qb', 'feature']);
      write(BASELINE, '{"endpoints": 2}\n');
      write('feature.txt', 'f\n');
      git(['add', '.']);
      git(['commit', '-qm', 'feature']);
      git(['checkout', '-q', 'main']);
      write(BASELINE, '{"endpoints": 3}\n');
      write('main.txt', 'm\n');
      git(['add', '.']);
      git(['commit', '-qm', 'main']);
      git(['checkout', '-q', 'feature']);

      // Without the driver this is a conflict; with it the merge is clean.
      expect(git(['merge', '--no-edit', 'main'])).not.toBeNull();
      expect(git(['show', `HEAD:${BASELINE}`])).toBe('{"endpoints": 2}\n');

      const result = regenerateAfterMerge({
        git,
        regenerate: () => {
          write(BASELINE, '{"endpoints": 4}\n');
          return true;
        },
        amend: () => git(['commit', '-q', '--amend', '--no-edit']) !== null,
      });
      expect(result).toBe('amended');
      expect(git(['show', `HEAD:${BASELINE}`])).toBe('{"endpoints": 4}\n');
      expect(git(['rev-parse', '-q', '--verify', 'HEAD^2'])).not.toBeNull();
      expect(git(['status', '--porcelain'])).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('wiring', () => {
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  it('gives the generated file the driver', () => {
    expect(read('.gitattributes')).toContain(`${BASELINE} merge=${DRIVER}`);
  });

  it('runs the regeneration from the post-merge hook', () => {
    expect(read('.husky/post-merge')).toContain('node scripts/post-merge-regenerate.mjs');
  });

  it('installs the driver from the pre-commit hook and postinstall', () => {
    expect(read('.husky/pre-commit')).toContain('node scripts/install-merge-drivers.mjs');
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.postinstall).toContain('node scripts/install-merge-drivers.mjs');
  });

  it('regenerates with the same commands the pre-commit hook uses', () => {
    const hook = read('.husky/pre-commit');
    for (const c of REGENERATE_COMMANDS) expect(hook).toContain(c);
  });
});
