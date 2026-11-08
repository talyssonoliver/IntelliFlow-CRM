/**
 * The review loop of scripts/codex-review.mjs, kept free of process state so it can be tested:
 * the changed-file list, one review per diff chunk with the Claude fallback, and the verdict.
 * The rule it enforces (#1274): a diff that was not reviewed whole is never a PASS.
 */
import { chunkSections, collectScopedDiff, DiffInputError } from './codex-diff.mjs';

const lines = (text) =>
  text
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

/**
 * Files changed between the base and HEAD, plus staged files (the `--base=HEAD` self-test).
 * git runs without a shell. A base that does not resolve throws: an empty list would read as
 * "nothing to review" and pass.
 */
export function listChangedFiles(base, spawn) {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true };
  const quote = ['-c', 'core.quotePath=false'];
  const committed = spawn('git', [...quote, 'diff', '--name-only', `${base}...HEAD`], options);
  if (committed.error || committed.status !== 0) {
    const reason = committed.error
      ? committed.error.message
      : (committed.stderr || '').trim() || `exit ${committed.status}`;
    throw new DiffInputError('base-unresolved', `cannot list changes against ${base}: ${reason}`);
  }
  const staged = spawn('git', [...quote, 'diff', '--cached', '--name-only'], options);
  const stagedFiles = staged.status === 0 ? lines(staged.stdout || '') : [];
  return [...new Set([...lines(committed.stdout || ''), ...stagedFiles])];
}

/**
 * Runs one prompt through codex, then the Claude fallback when codex is unusable or gave nothing
 * parseable (the OpenAI usage/tier cap answers with an error, not JSON).
 *   runCodex(prompt)  -> { raw, status, stderr }
 *   runClaude(prompt) -> raw text
 *   extract(raw)      -> { findings } or null
 */
export function reviewWithFallback(
  prompt,
  { codexUsable, claudeUsable, runCodex, runClaude, extract, log }
) {
  let raw = '';
  if (codexUsable) {
    log.out('[codex-review] Running Codex review (headless, OAuth) ...\n');
    const r = runCodex(prompt);
    raw = r.raw || '';
    const parsed = extract(raw);
    if (parsed) return { parsed, reviewer: 'codex', raw };
    log.err(
      `[codex-review] WARN: Codex produced no parseable findings (exit ${r.status ?? -1}) — ` +
        'likely the OpenAI usage/tier cap or a transient error.\n'
    );
    if (r.stderr) log.err(`${r.stderr.slice(0, 1000)}\n`);
  }
  if (claudeUsable) {
    log.out('[codex-review] Falling back to Claude review (claude -p, local) ...\n');
    raw = runClaude(prompt) || '';
    const parsed = extract(raw);
    if (parsed) return { parsed, reviewer: 'claude', raw };
  }
  return { parsed: null, reviewer: null, raw };
}

/**
 * Reviews every chunk in order and writes each prompt and raw answer (codex-prompt.txt for one
 * chunk, codex-prompt-N.txt for several). Returns the findings, the reviewers used and the
 * 1-based numbers of chunks that got no parseable review.
 */
export function reviewChunks(chunks, { buildPrompt, review, write, log }) {
  const findings = [];
  const reviewers = new Set();
  const unreviewed = [];
  chunks.forEach((chunk, i) => {
    const many = chunks.length > 1;
    const suffix = many ? `-${i + 1}` : '';
    if (many) {
      log.out(
        `[codex-review] chunk ${i + 1}/${chunks.length}: ${chunk.files.length} file(s), ` +
          `${chunk.text.length} characters\n`
      );
    }
    const prompt = buildPrompt(
      chunk.files,
      many ? ` (part ${i + 1} of ${chunks.length})` : '',
      chunk.text
    );
    write(`codex-prompt${suffix}.txt`, prompt);
    const result = review(prompt);
    write(`codex-raw${suffix}.txt`, result.raw);
    if (result.parsed) {
      reviewers.add(result.reviewer);
      findings.push(...result.parsed.findings);
    } else {
      unreviewed.push(i + 1);
    }
  });
  return { findings, reviewers: [...reviewers], unreviewed };
}

/**
 * What a chunked review adds up to:
 *   skip        no chunk got a parseable review (no reviewer worked; the old degrade path)
 *   incomplete  some chunks were reviewed and some were not: FAIL, never a partial PASS
 *   reviewed    every chunk was reviewed; findings and waivers decide
 */
export function chunkOutcome(chunkCount, unreviewed) {
  if (unreviewed.length === 0) return { kind: 'reviewed' };
  if (unreviewed.length === chunkCount) {
    return {
      kind: 'skip',
      message:
        'SKIPPED_PRECONDITION: no semantic reviewer produced parseable output ' +
        '(codex unavailable/capped AND claude unavailable/failed). ' +
        'Review artifacts/codex-review/codex-raw*.txt.',
    };
  }
  return {
    kind: 'incomplete',
    message:
      `INCOMPLETE_REVIEW: chunk(s) ${unreviewed.join(', ')} of ${chunkCount} got no ` +
      'parseable review; the rest of the diff is unreviewed. Gate FAIL.',
  };
}

/** The message for a diff that cannot be reviewed whole. Anything but a DiffInputError rethrows. */
export function diffInputMessage(err) {
  if (!(err instanceof DiffInputError)) throw err;
  return `DIFF_INPUT_ERROR (${err.code}): ${err.message}. Gate FAIL — nothing was reviewed.`;
}

/** The findings.json body for a gate that failed before or during review. */
export function failureArtifact({ baseRef, scopedFiles, findings = [], message }) {
  return {
    base_ref: baseRef,
    scoped_files: scopedFiles,
    findings,
    verdict: 'FAIL',
    error: message,
  };
}

/** Artifacts a previous run left that this run rewrites: codex-prompt*.txt and codex-raw*.txt. */
export const isStaleReviewArtifact = (name) => /^codex-(prompt|raw)(-\d+)?\.txt$/.test(name);

/**
 * The changed files and those in review scope, or `{ message }` when the base does not resolve.
 */
export function scopeChanges(base, spawn, isInScope) {
  try {
    const changed = listChangedFiles(base, spawn);
    return { changed, scoped: changed.filter(isInScope) };
  } catch (err) {
    return { message: diffInputMessage(err) };
  }
}

/**
 * One codex run. The previous run's last message is removed first: when codex exits without
 * writing one (quota cap, crash), a stale file would replay old findings as this run's verdict.
 */
export function makeCodexRunner({
  lastMsgPath,
  repoRoot,
  fs,
  runCodexReviewer,
  spawn,
  verbose,
  log,
}) {
  return (prompt) => {
    fs.rmSync(lastMsgPath, { force: true });
    const r = runCodexReviewer(prompt, lastMsgPath, repoRoot, spawn);
    if (verbose) {
      log.err(`--- codex stdout ---\n${r.stdout || ''}\n`);
      log.err(`--- codex stderr ---\n${r.stderr || ''}\n`);
    }
    const raw =
      (fs.existsSync(lastMsgPath) && fs.readFileSync(lastMsgPath, 'utf8')) ||
      r.stdout ||
      r.stderr ||
      '';
    return { raw, status: r.status, stderr: r.stderr };
  };
}

/**
 * Everything after the scope is known: collect the whole diff, split it, review each chunk and
 * add it up. Returns { kind: 'reviewed' | 'skip' | 'fail', message?, findings, reviewerUsed,
 * chunkCount }. A diff that cannot be collected whole, or a partly reviewed one, is 'fail'.
 */
export function runChunkedReview({
  baseRef,
  scopedFiles,
  repoRoot,
  spawn,
  buildPrompt,
  review,
  write,
  clearStale,
  log,
}) {
  let chunks;
  try {
    chunks = chunkSections(collectScopedDiff({ baseRef, files: scopedFiles, repoRoot, spawn }));
  } catch (err) {
    return { kind: 'fail', message: diffInputMessage(err), findings: [], chunkCount: 0 };
  }
  const chars = chunks.reduce((n, c) => n + c.text.length, 0);
  log.out(`[codex-review] diff     : ${chars} characters in ${chunks.length} chunk(s)\n`);
  clearStale();
  const { findings, reviewers, unreviewed } = reviewChunks(chunks, {
    buildPrompt,
    review,
    write,
    log,
  });
  const outcome = chunkOutcome(chunks.length, unreviewed);
  return {
    kind: outcome.kind === 'incomplete' ? 'fail' : outcome.kind,
    message: outcome.message,
    findings,
    reviewerUsed: reviewers.join('+'),
    chunkCount: chunks.length,
  };
}
