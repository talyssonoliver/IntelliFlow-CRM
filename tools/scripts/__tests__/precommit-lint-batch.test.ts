/**
 * Tests for the batched eslint invocation in `.husky/pre-commit`'s
 * "Auto-fixing + linting staged .ts/.tsx files" step.
 *
 * A large commit (the s9383 merge: 657 staged files, 380 of them
 * .ts/.tsx/.js/.jsx/.mjs/.cjs) used to pipe every staged path to one
 * `pnpm exec eslint --fix ...` call, which overflowed a Windows
 * command-line limit ("The command line is too long") and blocked the
 * commit outright.
 *
 * That failure is specific to this exact invocation chain: `pnpm exec
 * eslint` resolves `pnpm` to its POSIX shim under Git Bash (not
 * pnpm.cmd), which re-execs node; then pnpm itself resolves `eslint`
 * through node_modules/.bin's own shim, which re-execs node again. Each
 * hop rebuilds the Win32 command line from the full argv, and the
 * combined limit measured in practice (`pnpm exec eslint --version`
 * against this repo's real staged-file list) is far below either the
 * commonly-cited ~8191-char cmd.exe line limit or the ~32767-char
 * Windows CreateProcess limit — a plain single-hop exec (e.g. `pnpm
 * exec node <script>`) tolerates thousands more characters than `pnpm
 * exec eslint` does. A synthetic stand-in for eslint would not
 * reproduce this, so this test runs the real `pnpm exec eslint
 * --version` (harmless: eslint exits on `--version` before touching
 * any file argument, real or not) through the hook's own `-s` value,
 * across a large generated staged-file list shaped like the real
 * merge's.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.husky', 'pre-commit');

/** Pulls the `-s <N>` batch size straight off the hook's xargs line, so this
 * test tracks whatever value is actually shipped instead of a copy that can
 * silently drift from it. */
function readConfiguredBatchChars(hookSrc: string): number {
  const m = hookSrc.match(
    /xargs -s (\d+) -x pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored/
  );
  if (!m) {
    throw new Error(
      'Could not find the batched `xargs -s <N> -x pnpm exec eslint ...` line in .husky/pre-commit — ' +
        'did its shape change? Update this test to match.'
    );
  }
  return Number(m[1]);
}

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
  it('still bounds the eslint xargs call to -s <N> -x pnpm exec eslint --fix ...', () => {
    const hook = fs.readFileSync(HOOK, 'utf8');
    expect(() => readConfiguredBatchChars(hook)).not.toThrow();
  });

  it(
    'runs the real `pnpm exec eslint` across a large staged-file list, batched at the ' +
      "hook's own -s value, without hitting the Windows command-line limit",
    () => {
      const sh = resolveSh();
      const batchChars = readConfiguredBatchChars(fs.readFileSync(HOOK, 'utf8'));

      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-lint-batch-'));
      // Same rough shape (nesting depth, filename length) as the s9383
      // merge's real staged set (380 files, ~52 chars average path).
      const files: string[] = [];
      for (let i = 0; i < 650; i++) {
        files.push(`apps/web/src/modules/feature-${i}/components/SomeComponent-${i}.tsx`);
      }
      // Written to a file and `cat`, not passed through `env:` — the real
      // hook's STAGED_TS is a plain (non-exported) shell variable, piped
      // into `xargs` as stdin text, never inherited as an environment
      // variable by the spawned children. Putting 650 paths into an actual
      // env var instead would inflate every child's environment block and
      // fail for a reason that has nothing to do with the command-line
      // length bug being tested here ("environment is too large for exec"
      // vs. "command line is too long").
      const stagedFile = path.join(tmp, 'staged.txt');
      fs.writeFileSync(stagedFile, files.join('\n') + '\n');

      // `eslint --version` exits before touching any file argument (real
      // or, as here, synthetic and nonexistent), so this is harmless and
      // still goes through the exact chain that broke: pnpm's POSIX shim
      // re-execs node, which re-execs node_modules/.bin/eslint's own shim.
      const cmd =
        `cat ${JSON.stringify(toShPath(stagedFile))}` +
        ` | xargs -s ${batchChars} -x pnpm exec eslint --version`;
      const result = spawnSync(sh, ['-c', cmd], {
        cwd: ROOT,
        env: process.env,
        encoding: 'utf8',
      });

      expect(result.error).toBeUndefined();
      expect(result.stdout + result.stderr).not.toMatch(/command line is too long/i);
      expect(result.status).toBe(0);

      // Batching actually happened — eslint's version banner printed more
      // than once, meaning more than one invocation ran rather than one
      // giant call for all 650 paths.
      const versionLines = (result.stdout.match(/^v\d+\.\d+\.\d+$/gm) ?? []).length;
      expect(versionLines).toBeGreaterThan(1);

      fs.rmSync(tmp, { recursive: true, force: true });
    }
  );
});
