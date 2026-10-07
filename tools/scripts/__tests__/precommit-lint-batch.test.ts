/**
 * Tests for the batched eslint invocation in `.husky/pre-commit`'s
 * "Auto-fixing + linting staged .ts/.tsx files" step.
 *
 * A large commit (the s9383 merge: 657 staged files, 380 of them
 * .ts/.tsx/.js/.jsx/.mjs/.cjs) used to pipe every staged path to one
 * `pnpm exec eslint --fix ...` call, which overflowed Windows' command-line
 * limit ("The command line is too long"). The fix bounds each `xargs`
 * invocation to `-s 7000` (max total command-line chars, command + args
 * together) with `-x` (fail loudly, rather than silently doing something
 * else, if a single item still can't fit).
 *
 * This does not run real eslint. It swaps the trailing command for a tiny
 * recorder script and feeds it a large, generated list of staged-looking
 * paths (same shape as the real merge's staged set), then asserts:
 *   1. batching actually happened (more than one invocation),
 *   2. no single invocation's reconstructed command line exceeds the
 *      configured ceiling, and
 *   3. every path was covered, exactly once, across all batches.
 * It also pins the hook file to still carry the `-s 7000 -x` flags on that
 * line, so a future edit that silently drops the batching fails here
 * instead of on the next large merge.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.husky', 'pre-commit');

/**
 * Git for Windows' `sh.exe` isn't necessarily on the inherited PATH (only
 * `Git\cmd` usually is), so resolve it the same way Git itself does: next to
 * the `git` binary. On non-Windows, plain `sh` is on PATH.
 */
function resolveSh(): string {
  if (process.platform !== 'win32') return 'sh';

  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['ProgramW6432'],
  ].filter((p): p is string => Boolean(p));
  for (const root of roots) {
    for (const rel of ['Git/bin/sh.exe', 'Git/usr/bin/sh.exe']) {
      const candidate = path.join(root, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  try {
    const where = execSync('where git', { encoding: 'utf8' }).split(/\r?\n/).find(Boolean);
    if (where) {
      // .../Git/cmd/git.exe -> .../Git
      const gitRoot = path.dirname(path.dirname(where.trim()));
      const candidate = path.join(gitRoot, 'bin', 'sh.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // fall through to the bare-name last resort below
  }

  return 'sh';
}

const toShPath = (p: string) => p.replace(/\\/g, '/');

describe('.husky/pre-commit — batched staged-file lint', () => {
  it('still bounds the eslint xargs call to -s 7000 -x', () => {
    const hook = fs.readFileSync(HOOK, 'utf8');
    expect(hook).toMatch(
      /xargs -s 7000 -x pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored/
    );
  });

  it('batches a large staged-file list so no invocation exceeds the limit, covering every file exactly once', () => {
    const sh = resolveSh();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-lint-batch-'));
    const recorder = path.join(tmp, 'recorder.cjs');
    const log = path.join(tmp, 'calls.log');
    fs.writeFileSync(log, '');
    fs.writeFileSync(
      recorder,
      [
        "const fs = require('fs');",
        `fs.appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join('\\n') + '\\n---\\n');`,
      ].join('\n')
    );

    // Simulate the real merge: hundreds of plausible staged TS paths, same
    // rough shape (nesting depth, filename length) as the s9383 merge's
    // staged set.
    const files: string[] = [];
    for (let i = 0; i < 650; i++) {
      files.push(`apps/web/src/modules/feature-${i}/components/SomeComponent-${i}.tsx`);
    }
    // Written to a file and `cat`, not passed through `env:` — the real hook's
    // STAGED_TS is a plain (non-exported) shell variable, piped into `xargs`
    // as stdin text, never inherited as an environment variable by the
    // spawned children. Putting 650 paths into an actual env var instead
    // would inflate every child's environment block and fail for a reason
    // that has nothing to do with the command-line-length bug being fixed
    // here ("environment is too large for exec" vs. "command line is too
    // long") — this mirrors the real mechanism exactly.
    const stagedFile = path.join(tmp, 'staged.txt');
    fs.writeFileSync(stagedFile, files.join('\n') + '\n');

    const cmd = `cat ${JSON.stringify(toShPath(stagedFile))} | xargs -s 7000 -x node ${JSON.stringify(toShPath(recorder))}`;
    const result = spawnSync(sh, ['-c', cmd], {
      env: process.env,
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);

    const raw = fs.readFileSync(log, 'utf8');
    const batches = raw
      .split('---\n')
      .map((b) => b.trim())
      .filter(Boolean);

    // Batching actually happened — not one giant call for all 650 paths.
    expect(batches.length).toBeGreaterThan(1);

    // No single invocation's reconstructed command line exceeds the
    // configured ceiling (generous slack for quoting differences between
    // xargs' own accounting and this naive reconstruction).
    const prefixLen = `node ${recorder} `.length;
    for (const batch of batches) {
      const args = batch.split('\n').filter(Boolean);
      const cmdLen = prefixLen + args.reduce((n, a) => n + a.length + 1, 0);
      expect(cmdLen).toBeLessThanOrEqual(7100);
    }

    // Every file was covered, exactly once, across all batches.
    const seen = batches.flatMap((b) => b.split('\n').filter(Boolean));
    expect(seen.length).toBe(files.length);
    expect(new Set(seen)).toEqual(new Set(files));

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
