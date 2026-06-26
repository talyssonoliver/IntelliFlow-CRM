/**
 * Regression tests for .claude/hooks/git-destructive-guard.mjs.
 *
 * Locks in: (a) raw destructive commands stay blocked, (b) the `-C`/`--git-dir`
 * global-option bypass is closed in BOTH raw and argv (exec) forms, (c) the single
 * allowlisted script (sync-control-plane.mjs) is exempt, and (d) benign commands
 * are not over-blocked. If anyone loosens a pattern, these fail.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'git-destructive-guard.mjs');

function decision(command: string): 'deny' | 'allow' {
  const res = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    cwd: ROOT,
  });
  const out = (res.stdout || '').trim();
  if (!out) return 'allow';
  try {
    return JSON.parse(out).hookSpecificOutput?.permissionDecision === 'deny' ? 'deny' : 'allow';
  } catch {
    return 'allow';
  }
}

const tmpFiles: string[] = [];
function writeTempScript(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  const f = path.join(dir, 'script.mjs');
  fs.writeFileSync(f, content);
  tmpFiles.push(dir);
  return f;
}
afterAll(() => {
  for (const d of tmpFiles) fs.rmSync(d, { recursive: true, force: true });
});

describe('git-destructive-guard', () => {
  it('blocks raw git reset --hard', () => {
    expect(decision('git reset --hard origin/main')).toBe('deny');
  });

  it('blocks reset --hard hidden behind -C (raw bash)', () => {
    expect(decision('git -C /some/repo reset --hard origin/main')).toBe('deny');
  });

  it('blocks reset --hard hidden behind --git-dir (raw bash)', () => {
    expect(decision('git --git-dir /r/.git reset --hard origin/main')).toBe('deny');
  });

  it('allows the allowlisted sync-control-plane script', () => {
    expect(decision('node tools/scripts/sync-control-plane.mjs --branch main --apply')).toBe(
      'allow'
    );
  });

  it('blocks a non-allowlisted script that spawns argv-form reset --hard behind -C', () => {
    const f = writeTempScript(
      "import { execFileSync } from 'node:child_process';\n" +
        "execFileSync('git', ['-C', '/r', 'reset', '--hard', 'origin/main']);\n"
    );
    expect(decision(`node ${f}`)).toBe('deny');
  });

  it('blocks a look-alike path that merely ends with the allowlisted name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-evil-'));
    const sub = path.join(dir, 'evil-tools', 'scripts');
    fs.mkdirSync(sub, { recursive: true });
    const f = path.join(sub, 'sync-control-plane.mjs');
    fs.writeFileSync(
      f,
      "import { execFileSync } from 'node:child_process';\n" +
        "execFileSync('git', ['reset', '--hard', 'origin/main']);\n"
    );
    tmpFiles.push(dir);
    // 'evil-tools/scripts/sync-control-plane.mjs' must NOT match the allowlist suffix
    // 'tools/scripts/sync-control-plane.mjs' (only an exact '/'-bounded suffix counts).
    expect(decision(`node ${f}`)).toBe('deny');
  });

  it('does not over-block benign git commands (pull --ff-only behind -C)', () => {
    expect(decision('git -C /repo pull --ff-only origin main')).toBe('allow');
  });

  it('still blocks raw git push --force but allows --force-with-lease', () => {
    expect(decision('git push --force origin feat/x')).toBe('deny');
    expect(decision('git push --force-with-lease origin feat/x')).toBe('allow');
  });
});
