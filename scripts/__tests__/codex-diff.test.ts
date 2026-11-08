/**
 * The semantic review must never pass on less than the whole diff. On 2026-11-08 a 192-file PR
 * (#1272) gave git more than cmd.exe's 8191 characters of paths; git failed, the reviewer saw an
 * empty diff, and the gate passed. These tests pin the replacement: no shell, batched paths,
 * loud failures, and chunks that together carry every line.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  batchPaths,
  chunkSections,
  collectScopedDiff,
  DiffInputError,
  PATH_BATCH_CHARS,
  splitFileSections,
} from '../lib/codex-diff.mjs';

/** Longest command line CreateProcess accepts without a shell. */
const WINDOWS_ARG_LIMIT = 32_767;

const section = (file: string, hunks: string[]) =>
  `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n` +
  hunks.join('');

const hunk = (n: number, body: string) => `@@ -${n},1 +${n},1 @@\n-old ${n}\n+${body}\n`;

type SpawnCall = { cmd: string; args: string[]; options: Record<string, unknown> };

/** A spawn stand-in that answers each git call from `reply` and records it. */
function fakeSpawn(
  reply: (args: string[]) => { status: number; stdout?: string; stderr?: string }
) {
  const calls: SpawnCall[] = [];
  const spawn = (cmd: string, args: string[], options: Record<string, unknown>) => {
    calls.push({ cmd, args, options });
    return { stdout: '', stderr: '', ...reply(args) };
  };
  return { spawn, calls };
}

/** The paths after `--` in one recorded git call. */
const pathsOf = (call: SpawnCall) => call.args.slice(call.args.indexOf('--') + 1);

describe('batching paths for git', () => {
  it('keeps every batch under the limit and drops no path', () => {
    const files = Array.from({ length: 500 }, (_, i) => `apps/web/src/app/area-${i}/page.tsx`);
    const batches = batchPaths(files, 1_000);
    expect(batches.flat()).toEqual(files);
    for (const b of batches) expect(b.join(' ').length).toBeLessThanOrEqual(1_000);
  });

  it('gives a path longer than the limit a batch of its own', () => {
    const long = 'x'.repeat(50);
    expect(batchPaths(['a', long, 'b'], 10)).toEqual([['a'], [long], ['b']]);
  });
});

describe('splitting git diff output by file', () => {
  it('names each section after its file, deletions and renames included', () => {
    const text =
      section('src/a.ts', [hunk(1, 'a')]) +
      'diff --git a/src/gone.ts b/src/gone.ts\ndeleted file mode 100644\n--- a/src/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n' +
      'diff --git a/src/old.ts b/src/new.ts\nsimilarity index 100%\nrename from src/old.ts\nrename to src/new.ts\n' +
      'diff --git a/src/logo.png b/src/logo.png\nBinary files a/src/logo.png and b/src/logo.png differ\n';
    const sections = splitFileSections(text);
    expect(sections.map((s) => s.file)).toEqual([
      'src/a.ts',
      'src/gone.ts',
      'src/new.ts',
      'src/logo.png',
    ]);
    expect(sections.map((s) => s.text).join('')).toBe(text);
  });
});

describe('collecting the scoped diff', () => {
  it('runs git with no shell, in batches CreateProcess accepts, and covers every file', () => {
    // 400 paths of ~70 characters: about 28,000 characters, over cmd.exe's 8191.
    const files = Array.from(
      { length: 400 },
      (_, i) => `apps/web/src/app/(app)/settings/some-long-area-name/file-${i}.tsx`
    );
    expect(files.join(' ').length).toBeGreaterThan(8_191);
    const { spawn, calls } = fakeSpawn((args) => ({
      status: 0,
      stdout: pathsOf({ cmd: 'git', args, options: {} })
        .map((f) => section(f, [hunk(1, f)]))
        .join(''),
    }));

    const sections = collectScopedDiff({ baseRef: 'origin/main', files, repoRoot: '/repo', spawn });

    expect(sections.map((s) => s.file)).toEqual(files);
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(call.cmd).toBe('git');
      expect(call.options.shell).toBe(false);
      expect(call.args.join(' ').length).toBeLessThan(WINDOWS_ARG_LIMIT);
      expect(pathsOf(call).join(' ').length).toBeLessThanOrEqual(PATH_BATCH_CHARS);
      expect(call.args).toContain('origin/main...HEAD');
    }
  });

  it('fails loudly when git fails, instead of reviewing an empty diff', () => {
    const { spawn } = fakeSpawn(() => ({ status: 1, stderr: 'The command line is too long.' }));
    expect(() =>
      collectScopedDiff({ baseRef: 'origin/main', files: ['src/a.ts'], repoRoot: '/r', spawn })
    ).toThrow(expect.objectContaining({ code: 'git-diff-failed' }));
  });

  it('fails loudly when git returns nothing for the scoped files', () => {
    const { spawn } = fakeSpawn(() => ({ status: 0, stdout: '' }));
    let error: unknown;
    try {
      collectScopedDiff({ baseRef: 'origin/main', files: ['src/a.ts'], repoRoot: '/r', spawn });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DiffInputError);
    expect((error as DiffInputError).code).toBe('empty-diff');
  });

  it('fails when one scoped file has no diff, naming it', () => {
    const { spawn } = fakeSpawn((args) =>
      args.includes('--cached')
        ? { status: 0, stdout: '' }
        : { status: 0, stdout: section('src/a.ts', [hunk(1, 'a')]) }
    );
    expect(() =>
      collectScopedDiff({
        baseRef: 'origin/main',
        files: ['src/a.ts', 'src/b.ts'],
        repoRoot: '/r',
        spawn,
      })
    ).toThrow(/1 of 2 scoped file\(s\): src\/b\.ts/);
  });

  it('takes staged changes for files the committed diff does not cover', () => {
    const { spawn, calls } = fakeSpawn((args) =>
      args.includes('--cached')
        ? { status: 0, stdout: section('src/b.ts', [hunk(1, 'staged')]) }
        : { status: 0, stdout: section('src/a.ts', [hunk(1, 'a')]) }
    );
    const sections = collectScopedDiff({
      baseRef: 'HEAD',
      files: ['src/a.ts', 'src/b.ts'],
      repoRoot: '/r',
      spawn,
    });
    expect(sections.map((s) => s.file)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(pathsOf(calls[1])).toEqual(['src/b.ts']);
  });
});

describe('chunking the diff for review', () => {
  it('keeps every chunk under the cap and loses no character', () => {
    const sections = Array.from({ length: 40 }, (_, i) => {
      const file = `src/f${i}.ts`;
      return { file, text: section(file, [hunk(1, 'y'.repeat(300))]) };
    });
    const chunks = chunkSections(sections, 2_000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(2_000);
    expect(chunks.map((c) => c.text).join('')).toBe(sections.map((s) => s.text).join(''));
    expect(chunks.flatMap((c) => c.files)).toEqual(sections.map((s) => s.file));
  });

  it('splits one large file at its hunks and repeats the file header in each piece', () => {
    const file = 'src/big.ts';
    const hunks = Array.from({ length: 10 }, (_, i) => hunk(i * 10 + 1, 'z'.repeat(200)));
    const chunks = chunkSections([{ file, text: section(file, hunks) }], 800);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(800);
      expect(c.text.startsWith(`diff --git a/${file} b/${file}\n`)).toBe(true);
      expect(c.files).toEqual([file]);
    }
    const reviewedHunks = chunks.flatMap((c) => c.text.split(/^(?=@@ )/m).slice(1));
    expect(reviewedHunks).toEqual(hunks);
  });

  it('refuses a single hunk over the cap rather than cutting it', () => {
    const file = 'src/huge.ts';
    expect(() =>
      chunkSections([{ file, text: section(file, [hunk(1, 'q'.repeat(5_000))]) }], 1_000)
    ).toThrow(expect.objectContaining({ code: 'diff-over-cap' }));
  });
});

describe('against a real git repository', () => {
  it('reviews a change with more than 8k characters of paths whole', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'codex-diff-'));
    const git = (...args: string[]) => {
      const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout;
    };
    try {
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 'test@example.invalid');
      git('config', 'user.name', 'test');
      git('config', 'commit.gpgsign', 'false');
      writeFileSync(path.join(repo, 'README'), 'base\n');
      git('add', '.');
      git('commit', '-q', '-m', 'base');
      git('checkout', '-q', '-b', 'feature');
      const dir = 'apps/web/src/app/(app)/a-fairly-long-route-segment-name';
      mkdirSync(path.join(repo, dir), { recursive: true });
      const files = Array.from({ length: 220 }, (_, i) => `${dir}/component-number-${i}.tsx`);
      for (const f of files) writeFileSync(path.join(repo, f), `export const v = ${f.length};\n`);
      git('add', '.');
      git('commit', '-q', '-m', 'feature');
      expect(files.join(' ').length).toBeGreaterThan(8_191);

      const sections = collectScopedDiff({
        baseRef: 'main',
        files,
        repoRoot: repo,
        spawn: spawnSync,
      });
      expect(sections.map((s) => s.file)).toEqual(files);
      for (const s of sections) expect(s.text).toContain(`+export const v = ${s.file.length};`);

      const chunks = chunkSections(sections, 4_000);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.flatMap((c) => c.files)).toEqual(files);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
