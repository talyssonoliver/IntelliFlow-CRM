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

describe('git-destructive-guard — executable-aware scanning', () => {
  // False positives the old substring scanner (wrongly) blocked: a git-command
  // string living inside a quoted argument value or a heredoc body. The scan now
  // identifies the segment's real executable and only applies the git patterns
  // when that executable is `git`.
  it('allows gh issue create whose --body inline-mentions "git push origin main"', () => {
    expect(decision('gh issue create --body "Direct git push origin main is gate-blocked"')).toBe(
      'allow'
    );
  });

  it('allows gh issue create whose heredoc body mentions git push origin main', () => {
    const cmd = [
      "gh issue create --body \"$(cat <<'BODY'",
      'Direct git push origin main is gate-blocked; PR required',
      'BODY',
      ')"',
    ].join('\n');
    expect(decision(cmd)).toBe('allow');
  });

  it('allows single-quoted literals that contain a destructive git string', () => {
    expect(decision("echo 'git reset --hard'")).toBe('allow');
    // $(...) inside single quotes is literal to the shell, so it is not a real
    // substitution and must not be treated as an executed git command.
    expect(decision("echo 'foo=$(git reset --hard)'")).toBe('allow');
  });

  it('allows a git commit whose message text mentions git push origin main', () => {
    expect(decision('git commit -m "remember to git push origin main later"')).toBe('allow');
  });

  it('allows grep for a destructive git string', () => {
    expect(decision('grep "git push --force" file.log')).toBe('allow');
  });

  // Bypass vectors that MUST stay blocked despite the executable-aware parsing.
  it('blocks an env-var assignment prefix in front of git push --force', () => {
    expect(decision('MSYS_NO_PATHCONV=1 git push --force origin x')).toBe('deny');
  });

  it('blocks an env/sudo wrapper in front of git reset --hard', () => {
    expect(decision('env git reset --hard')).toBe('deny');
  });

  it('blocks a destructive git command inside bash -c', () => {
    expect(decision('bash -c "git reset --hard"')).toBe('deny');
  });

  it('blocks a destructive git command inside a real command substitution', () => {
    expect(decision('foo=$(git reset --hard)')).toBe('deny');
    expect(decision('echo "$(git reset --hard)"')).toBe('deny');
  });

  it('blocks a destructive git command chained after a non-git command', () => {
    expect(decision('gh issue view 1 && git reset --hard')).toBe('deny');
  });

  it('still blocks a bare direct push to main', () => {
    expect(decision('git push origin main')).toBe('deny');
  });
});
