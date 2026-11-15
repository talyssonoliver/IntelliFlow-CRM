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

/**
 * Minimal environment for the spawned hook chain: PATH plus only what pnpm,
 * node and eslint need to start. Deliberately NOT `process.env`: under
 * `pnpm run test:unit` (how pre-ship launches vitest) that is inflated with
 * npm_config_* / npm_package_* vars, and `xargs` then fails with
 * "environment is too large for exec" — a failure unrelated to the
 * command-line-length behaviour this test pins down.
 */
function minimalEnv(): NodeJS.ProcessEnv {
  const keep = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'SYSTEMROOT',
    'ComSpec',
    'windir',
    'TEMP',
    'TMP',
    'TMPDIR',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'ProgramData',
    'COREPACK_HOME',
    'PNPM_HOME',
    'LANG',
    'LC_ALL',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) {
    if (process.env[k] !== undefined) env[k] = process.env[k];
  }
  return env;
}

const toShPath = (p: string) => p.replace(/\\/g, '/');

/** Same rough shape (depth, name length) as the s9383 merge's real staged set (650 paths). */
function stagedFiles(): string[] {
  const files: string[] = [];
  for (let i = 0; i < 650; i++) {
    files.push(`apps/web/src/modules/feature-${i}/components/SomeComponent-${i}.tsx`);
  }
  return files;
}

describe('.husky/pre-commit — batched staged-file lint', () => {
  it('still bounds the eslint xargs call to -s <N> -x pnpm exec eslint --fix ...', () => {
    const hook = fs.readFileSync(HOOK, 'utf8');
    expect(() => readConfiguredBatchChars(hook)).not.toThrow();
  });

  // Fixture: the hook's own -s value drives xargs, but the program is a tiny node stub, not
  // eslint. This proves the batching (several bounded calls, every path delivered exactly once)
  // without a pnpm + eslint start-up per batch, which took 45 min on a loaded gate.
  it("splits a large staged list into several calls, each within the hook's own -s value", () => {
    const sh = resolveSh();
    const batchChars = readConfiguredBatchChars(fs.readFileSync(HOOK, 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-lint-batch-'));
    try {
      const files = stagedFiles();
      const stagedFile = path.join(tmp, 'staged.txt');
      fs.writeFileSync(stagedFile, files.join('\n') + '\n');
      const stub = path.join(tmp, 'stub.cjs');
      fs.writeFileSync(
        stub,
        'const a = process.argv.slice(2);\n' +
          "console.log(JSON.stringify({ n: a.length, chars: a.join(' ').length }));\n"
      );
      const cmd =
        `cat ${JSON.stringify(toShPath(stagedFile))}` +
        ` | xargs -s ${batchChars} -x node ${JSON.stringify(toShPath(stub))}`;
      const result = spawnSync(sh, ['-c', cmd], { env: minimalEnv(), encoding: 'utf8' });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const calls = result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { n: number; chars: number });
      expect(calls.length).toBeGreaterThan(1);
      expect(calls.reduce((sum, c) => sum + c.n, 0)).toBe(files.length);
      for (const c of calls) expect(c.chars).toBeLessThanOrEqual(batchChars);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Real chain: pnpm's POSIX shim -> node -> eslint's shim -> node. Only this reproduces the
  // Windows command-line limit, and no pre-ship step or CI job runs it, so it runs on demand:
  // `pnpm run test:real-repo` (REAL_REPO_CHECKS=1).
  it.runIf(process.env['REAL_REPO_CHECKS'] === '1')(
    'runs the real `pnpm exec eslint` across a large staged-file list, batched at the ' +
      "hook's own -s value, without hitting the Windows command-line limit",
    () => {
      const sh = resolveSh();
      const batchChars = readConfiguredBatchChars(fs.readFileSync(HOOK, 'utf8'));
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-lint-batch-'));
      try {
        // A file + `cat`, not an env var: the real hook's STAGED_TS is never inherited by children.
        const stagedFile = path.join(tmp, 'staged.txt');
        fs.writeFileSync(stagedFile, stagedFiles().join('\n') + '\n');
        // `eslint --version` exits before touching any file argument, so this is harmless.
        const cmd =
          `cat ${JSON.stringify(toShPath(stagedFile))}` +
          ` | xargs -s ${batchChars} -x pnpm exec eslint --version`;
        const result = spawnSync(sh, ['-c', cmd], {
          cwd: ROOT,
          env: minimalEnv(),
          encoding: 'utf8',
        });

        expect(result.error).toBeUndefined();
        expect(result.stdout + result.stderr).not.toMatch(/command line is too long/i);
        expect(result.status).toBe(0);
        const versionLines = (result.stdout.match(/^v\d+\.\d+\.\d+$/gm) ?? []).length;
        expect(versionLines).toBeGreaterThan(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
    10 * 60_000
  );
});
