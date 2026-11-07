/**
 * The reviewer command lines scripts/codex-review.mjs runs. The reviewers read the diff and the
 * repo, and must not start processes: on 2026-11-07 a codex review, reproducing a finding, ran
 * Playwright's full Chromium with a temporary profile on the owner's PC, and each such start is
 * a failed Windows sign-in (enough of them lock the account).
 *
 * - codex: `-s read-only` overrides the global ~/.codex/config.toml sandbox_mode
 *   ("danger-full-access" on that PC), so model-run commands cannot write files or start a
 *   browser with a new profile.
 * - claude: `--disallowedTools Bash PowerShell` removes both shell tools, whatever the local
 *   settings allow; the review needs only reading tools.
 *
 * Kept apart from codex-review.mjs (which runs on import) so a test can check them.
 */

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
