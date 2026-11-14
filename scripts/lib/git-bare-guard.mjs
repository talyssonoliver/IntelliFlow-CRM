/**
 * Guard against the #1274 class of leak: a test runs `git init` / `git config` in a temp dir
 * while GIT_DIR (exported by the pre-push hook) still points at the real repository, and flips
 * the SHARED .git/config to core.bare=true, breaking every worktree's gate and push
 * (2026-11-08 codex-diff test; 2026-11-14 codex-fingerprint readTrackedFiles test).
 *
 * Wired as vitest's globalSetup: it reads core.bare before the run and fails the run if a test
 * left it true. Every git call a test makes in a temp repo must pass `env: gitEnv(process.env)`
 * (scripts/lib/preship-git.mjs).
 */
import { execFileSync } from 'node:child_process';

/** The real repository's core.bare, or '' when unset/unreadable. Inherits env on purpose. */
export function readCoreBare(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['config', '--get', 'core.bare'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** The failure message when the run turned core.bare on, or null. */
export function bareLeak(before, after) {
  if (after !== 'true' || before === 'true') return null;
  return (
    'A test set core.bare=true on the real repository: some git call in a test inherited ' +
    'GIT_DIR from the pre-push hook. Pass env: gitEnv(process.env) (scripts/lib/preship-git.mjs) ' +
    'to every git call in a temp repo. Restore the repo with: git config core.bare false'
  );
}

export default function setup() {
  const before = readCoreBare();
  return () => {
    const message = bareLeak(before, readCoreBare());
    if (message) throw new Error(message);
  };
}
