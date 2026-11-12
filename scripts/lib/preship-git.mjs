/**
 * The git plumbing pre-ship's scope resolvers share (lint, build and DB scope):
 * run git in a checkout without the GIT_* variables a git hook exports, and
 * split its output into non-empty lines.
 *
 * Under the pre-push hook GIT_DIR (and friends) point at the pushing repo and
 * override `cwd`, so a git call meant for a given checkout would silently read
 * the pushing one. Dropping them lets git discover the repo from `cwd`.
 */
import { spawnSync } from 'node:child_process';

/** `env` without any GIT_* variable. */
export function gitEnv(env) {
  const out = { ...env };
  for (const k of Object.keys(out)) if (k.startsWith('GIT_')) delete out[k];
  return out;
}

/**
 * Run git in `cwd`; its stdout, or null when it exited non-zero.
 * @param {string[]} args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @param {Function} [spawn] spawnSync-shaped, for tests
 * @returns {string | null}
 */
export function runGit(args, cwd, env, spawn = spawnSync) {
  const r = spawn('git', args, {
    cwd,
    env: gitEnv(env),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}

/** Trimmed, non-empty lines of `out` (null or undefined reads as empty). */
export function nonEmptyLines(out) {
  return (out || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
