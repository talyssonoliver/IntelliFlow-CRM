/**
 * How scripts/codex-review.mjs starts its reviewers. The reviewers read the diff and the repo,
 * and must not start processes: on 2026-11-07 a codex review, reproducing a finding, ran
 * Playwright's full Chromium with a temporary profile on the owner's PC, and each such start is
 * a failed Windows sign-in (enough of them lock the account).
 *
 * - codex: `-s read-only` overrides the global ~/.codex/config.toml sandbox_mode
 *   ("danger-full-access" on that PC), so model-run commands cannot write files or start a
 *   browser with a new profile.
 * - claude: `--disallowedTools Bash PowerShell` removes both shell tools, whatever the local
 *   settings allow; the review needs only reading tools.
 *
 * Kept apart from codex-review.mjs (which runs on import) so tests can check them in-process.
 */
import { spawnSync } from 'node:child_process';

/** Argv for `codex exec`: the prompt on stdin, the last message to `lastMessagePath`. */
export function codexExecArgs(lastMessagePath) {
  return ['exec', '-', '--ephemeral', '-s', 'read-only', '-o', lastMessagePath];
}

/** Argv for the Claude Code CLI fallback: one headless turn, JSON output, no shell tools. */
export const CLAUDE_REVIEW_ARGS = Object.freeze([
  '-p',
  '--output-format',
  'json',
  '--disallowedTools',
  'Bash',
  'PowerShell',
]);

/** spawnSync options for a reviewer: the prompt on stdin, a 5-minute wall clock. */
export function reviewerSpawnOptions(input, cwd, platform = process.platform, env = process.env) {
  return {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...env },
    cwd,
    shell: platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  };
}

/** Runs the codex reviewer in the read-only sandbox. */
export function runCodexReviewer(input, lastMessagePath, cwd, spawn = spawnSync) {
  return spawn('codex', codexExecArgs(lastMessagePath), reviewerSpawnOptions(input, cwd));
}

/** Runs the Claude fallback reviewer with no shell tools. */
export function runClaudeReviewer(input, cwd, spawn = spawnSync) {
  return spawn('claude', [...CLAUDE_REVIEW_ARGS], reviewerSpawnOptions(input, cwd));
}

/**
 * The review text from a `claude -p --output-format json` run: the envelope's `result`, else
 * the raw stdout (extractFindings scans either for the findings JSON), else stderr.
 */
export function claudeReviewText(result) {
  const out = result.stdout || '';
  try {
    const envelope = JSON.parse(out);
    if (envelope && typeof envelope.result === 'string') return envelope.result;
  } catch {
    // Not a JSON envelope: use the raw output.
  }
  return out || result.stderr || '';
}
