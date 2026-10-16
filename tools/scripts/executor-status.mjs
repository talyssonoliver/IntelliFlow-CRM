#!/usr/bin/env node
/**
 * CLI for the push-based executor status file (ADR-077, issue #581).
 *
 *   node tools/scripts/executor-status.mjs write <TASK> --phase <p> [--gate-status <g>]
 *        [--next <event>] [--detail <text>] [--branch <b>]   (no-op unless INTELLIFLOW_EXECUTOR_STATUS=1)
 *   node tools/scripts/executor-status.mjs read <TASK>       (exit 0 trusted, 2 = fall back to polling)
 *   node tools/scripts/executor-status.mjs list
 *
 * The status directory is shared by every worktree of the repo: it defaults to
 * `<main clone>/.claude/executor-status`, found via `git rev-parse --git-common-dir`.
 * Override with INTELLIFLOW_EXECUTOR_STATUS_DIR.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isEnabled,
  listExecutorStatuses,
  readExecutorStatus,
  writeExecutorStatus,
} from './lib/executor-status.mjs';

export function defaultStatusDir(env = process.env, cwd = process.cwd()) {
  if (env.INTELLIFLOW_EXECUTOR_STATUS_DIR) return path.resolve(env.INTELLIFLOW_EXECUTOR_STATUS_DIR);
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  return path.join(path.dirname(common), '.claude', 'executor-status');
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!key.startsWith('--') || args[i + 1] === undefined) throw new Error(`bad argument: ${key}`);
    flags[key.slice(2)] = args[i + 1];
  }
  return flags;
}

export function main(argv, env = process.env, out = console.log) {
  const [cmd, ...rest] = argv;
  if (cmd === 'write') {
    // Disabled by default: do not even resolve the directory.
    if (!isEnabled(env)) return 0;
    const [taskId, ...flagArgs] = rest;
    const f = parseFlags(flagArgs);
    const rec = writeExecutorStatus(
      defaultStatusDir(env),
      taskId,
      {
        phase: f.phase,
        gate_status: f['gate-status'],
        next_expected_event: f.next,
        detail: f.detail,
        branch: f.branch,
      },
      { env }
    );
    out(JSON.stringify(rec));
    return 0;
  }
  if (cmd === 'read') {
    const res = readExecutorStatus(defaultStatusDir(env), rest[0]);
    out(JSON.stringify(res));
    return res.needsPoll ? 2 : 0;
  }
  if (cmd === 'list') {
    out(JSON.stringify(listExecutorStatuses(defaultStatusDir(env)), null, 2));
    return 0;
  }
  out('usage: executor-status.mjs write|read|list (see file header)');
  return 64;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`executor-status: ${err.message}`);
    process.exitCode = 1;
  }
}
