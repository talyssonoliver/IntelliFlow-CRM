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

/**
 * Argv for `codex exec`: the prompt on stdin, the last message to `lastMessagePath`. `model` and
 * `effort` (from lib/review-tier.mjs) are passed as `-m` and `-c model_reasoning_effort=` for this
 * run only; the user's global ~/.codex/config.toml is never edited. Either may be null: codex then
 * uses its configured value.
 */
export function codexExecArgs(lastMessagePath, { model = null, effort = null } = {}) {
  const args = ['exec', '-', '--ephemeral', '-s', 'read-only'];
  if (model) args.push('-m', model);
  if (effort) args.push('-c', `model_reasoning_effort=${effort}`);
  args.push('-o', lastMessagePath);
  return args;
}

/**
 * Argv for the Claude Code CLI fallback (used only for a risky diff when Codex cannot review, see
 * lib/review-policy.mjs): one headless turn, JSON output, read-only tools, no MCP servers, no slash
 * commands, no shell tools.
 */
export const CLAUDE_REVIEW_ARGS = Object.freeze([
  '-p',
  '--output-format',
  'json',
  // Only what a read-only review uses (task tiering 26/11/2026): about half the cost per call.
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--tools',
  'Read,Grep,Glob',
  '--disallowedTools',
  'Bash',
  'PowerShell',
]);

/** The Claude fallback's model alias unless CODEX_REVIEW_CLAUDE_MODEL names another (owner ruling 27/11/2026: Sonnet). */
export const DEFAULT_CLAUDE_REVIEW_MODEL = 'sonnet';

/** The model the Claude fallback runs on: CODEX_REVIEW_CLAUDE_MODEL (alias or full id), else Sonnet. */
export function claudeReviewModel(env = process.env) {
  const v = String(env.CODEX_REVIEW_CLAUDE_MODEL ?? '').trim();
  return v || DEFAULT_CLAUDE_REVIEW_MODEL;
}

/** CLAUDE_REVIEW_ARGS with `--model <model>` passed explicitly, so the account default never decides. */
export function claudeReviewArgs(model = DEFAULT_CLAUDE_REVIEW_MODEL) {
  return [CLAUDE_REVIEW_ARGS[0], '--model', model, ...CLAUDE_REVIEW_ARGS.slice(1)];
}

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

/** Runs the codex reviewer in the read-only sandbox. spawn is child_process.spawnSync. */
export function runCodexReviewer(input, lastMessagePath, cwd, spawn, tier = {}) {
  return spawn('codex', codexExecArgs(lastMessagePath, tier), reviewerSpawnOptions(input, cwd));
}

/** Runs the Claude fallback reviewer with no shell tools. spawn is child_process.spawnSync. */
export function runClaudeReviewer(input, cwd, spawn, { model = claudeReviewModel() } = {}) {
  return spawn('claude', claudeReviewArgs(model), reviewerSpawnOptions(input, cwd));
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
