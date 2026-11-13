/**
 * Codex review: one review per head, and LOW findings that do not block.
 *
 * The semantic review used to run twice per push (a standalone
 * `node scripts/codex-review.mjs`, then again inside pre-ship), and the model is
 * not deterministic: each run tended to find one more LOW, which blocked, which
 * cost another full gate. Now:
 *
 * - REUSE. After a complete review the findings are stored with the head SHA and
 *   a hash of the exact diff that was reviewed (artifacts/codex-review/
 *   review-cache.json). A later run with the same head and the same diff reuses
 *   them instead of asking a reviewer again. Waivers and the severity policy are
 *   applied afresh on every run, so a waiver added after the review still counts.
 *   A different head, a different diff, or a missing/garbled cache means a new
 *   review. CODEX_REVIEW_NO_CACHE=1 forces one.
 *
 * - SEVERITY. Unwaived critical, high and medium findings block. Unwaived LOW
 *   findings do not: they are written to one follow-up issue per branch (created
 *   the first time, then extended), and the gate passes. A finding with any other
 *   severity value blocks, so a reviewer that drops the field cannot slip one
 *   through.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { scopeChanges } from './codex-chunk-review.mjs';
import { collectScopedDiff } from './codex-diff.mjs';

export const CACHE_VERSION = 1;
export const NO_CACHE_ENV = 'CODEX_REVIEW_NO_CACHE';

/** sha256 over the reviewed diff sections, in order, with their file names. */
export function diffHash(sections) {
  const h = crypto.createHash('sha256');
  for (const s of sections) {
    h.update(s.file);
    h.update('\0');
    h.update(s.text);
    h.update('\0');
  }
  return h.digest('hex');
}

/** The cache record written after a complete review. */
export function cacheRecord({ head, hash, baseRef, reviewer, findings, now = new Date() }) {
  return {
    version: CACHE_VERSION,
    head,
    diff_hash: hash,
    base_ref: baseRef,
    reviewer,
    reviewed_at: now.toISOString(),
    findings,
  };
}

/**
 * The cached findings when the cache was written for this head and this diff,
 * else null. Anything malformed is a miss.
 * @param {string} text the cache file's content ('' when absent)
 */
export function cachedFindings(text, { head, hash, env = process.env }) {
  if (env[NO_CACHE_ENV] === '1' || !text) return null;
  let c;
  try {
    c = JSON.parse(text);
  } catch {
    return null;
  }
  if (!c || c.version !== CACHE_VERSION || !Array.isArray(c.findings)) return null;
  if (!head || c.head !== head || c.diff_hash !== hash) return null;
  return c;
}

/** Is this finding LOW (non-blocking)? Anything that is not exactly "low" blocks. */
export function isLow(finding) {
  return (
    String(finding.severity ?? '')
      .trim()
      .toLowerCase() === 'low'
  );
}

/**
 * Split findings by the waiver list and the severity policy.
 * @param {object[]} findings each with a `fingerprint`
 * @param {Map<string, unknown>} waivers by fingerprint
 */
export function judge(findings, waivers) {
  const waived = findings.filter((f) => waivers.has(f.fingerprint));
  const unwaived = findings.filter((f) => !waivers.has(f.fingerprint));
  const low = unwaived.filter(isLow);
  const blocking = unwaived.filter((f) => !isLow(f));
  return { waived, unwaived, low, blocking, verdict: blocking.length === 0 ? 'PASS' : 'FAIL' };
}

// ── follow-up issue for LOW findings ─────────────────────────────────────

export const FOLLOWUP_TITLE_PREFIX = 'Semantic review follow-ups: ';
const FP_MARK = /<!-- fp:([0-9a-f]+) -->/g;

export function followupTitle(branch) {
  return `${FOLLOWUP_TITLE_PREFIX}${branch}`;
}

/** Fingerprints already listed in an issue body. */
export function listedFingerprints(body) {
  return new Set([...(body || '').matchAll(FP_MARK)].map((m) => m[1]));
}

function oneLine(s, max = 300) {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Markdown for one LOW finding, with a hidden fingerprint marker for dedupe. */
export function findingEntry(f, head) {
  return [
    `- [ ] \`${f.file}:${f.line}\` — **${oneLine(f.rule, 80)}** <!-- fp:${f.fingerprint} -->`,
    `  - Issue: ${oneLine(f.issue)}`,
    `  - Fix: ${oneLine(f.fix)}`,
    `  - Seen at ${String(head).slice(0, 9)}, fingerprint \`${String(f.fingerprint).slice(0, 12)}\``,
  ].join('\n');
}

/**
 * The issue body: the existing one plus entries for findings it does not list
 * yet. Returns null when nothing is new.
 */
export function followupBody({ existing, branch, pr, head, findings }) {
  const listed = listedFingerprints(existing);
  const fresh = findings.filter((f) => !listed.has(f.fingerprint));
  const seen = new Set();
  const unique = fresh.filter((f) => !seen.has(f.fingerprint) && seen.add(f.fingerprint));
  if (unique.length === 0) return null;
  const entries = unique.map((f) => findingEntry(f, head)).join('\n');
  if (existing) return `${existing.trimEnd()}\n${entries}\n`;
  const prLine = pr ? `Pull request: #${pr}` : `Branch: \`${branch}\``;
  return [
    `Low-severity findings from the local semantic review of \`${branch}\`.`,
    'They did not block the push. Fix them in a follow-up, or waive a false positive in',
    '`tools/audit/codex-review-waivers.yaml`.',
    '',
    prLine,
    '',
    entries,
    '',
  ].join('\n');
}

/**
 * Create or extend the branch's follow-up issue through the gh CLI. Never
 * throws: returns { ok, message }. `gh(args)` returns { status, stdout, stderr }.
 */
export function recordLowFindings({ gh, branch, head, findings, writeBodyFile }) {
  if (findings.length === 0) return { ok: true, message: 'no LOW findings' };
  if (!branch || branch === 'HEAD') {
    return { ok: false, message: 'detached HEAD: no branch to file LOW findings under' };
  }
  const title = followupTitle(branch);
  const pr = (() => {
    const r = gh(['pr', 'view', '--json', 'number', '--jq', '.number']);
    return r.status === 0 && /^\d+$/.test(String(r.stdout).trim()) ? String(r.stdout).trim() : null;
  })();
  const list = gh([
    'issue',
    'list',
    '--state',
    'open',
    '--search',
    `"${title}" in:title`,
    '--json',
    'number,title,body',
    '--limit',
    '20',
  ]);
  if (list.status !== 0)
    return { ok: false, message: `gh issue list failed: ${oneLine(list.stderr)}` };
  let issues;
  try {
    issues = JSON.parse(list.stdout || '[]');
  } catch {
    return { ok: false, message: 'gh issue list returned unreadable JSON' };
  }
  const issue = issues.find((i) => i.title === title);
  const body = followupBody({ existing: issue?.body ?? '', branch, pr, head, findings });
  if (body === null) {
    return { ok: true, message: `issue #${issue.number} already lists every LOW finding` };
  }
  const bodyFile = writeBodyFile(body);
  const r = issue
    ? gh(['issue', 'edit', String(issue.number), '--body-file', bodyFile])
    : gh(['issue', 'create', '--title', title, '--body-file', bodyFile]);
  if (r.status !== 0) {
    return {
      ok: false,
      message: `gh issue ${issue ? 'edit' : 'create'} failed: ${oneLine(r.stderr)}`,
    };
  }
  const where = issue ? `#${issue.number}` : oneLine(r.stdout);
  return { ok: true, message: `LOW findings recorded in ${where}` };
}

/**
 * The head SHA and the hash of the diff a run would review, plus the cached
 * review when one matches both. Any problem collecting them is a miss, never a
 * pass: the normal path then reports it.
 * @param {{head: string, scope: {message?: string, scoped: string[]},
 *          collect: (files: string[]) => {file: string, text: string}[],
 *          readCache: () => string, env?: NodeJS.ProcessEnv}} io
 */
export function lookupReview({ head, scope, collect, readCache, env = process.env }) {
  if (!head || scope.message || scope.scoped.length === 0) return { head, hit: null };
  let hash;
  try {
    hash = diffHash(collect(scope.scoped));
  } catch {
    return { head, hit: null };
  }
  return {
    head,
    hash,
    scopedFiles: scope.scoped,
    hit: cachedFindings(readCache(), { head, hash, env }),
  };
}

/**
 * gh through a spawnSync-like function, as { status, stdout, stderr }. A spawn
 * error (gh missing) reads as a failure.
 */
export function ghRunner(spawn, cwd) {
  return (args) => {
    const r = spawn('gh', args, { cwd, encoding: 'utf8', timeout: 60_000 });
    return {
      status: r.error ? 1 : r.status,
      stdout: r.stdout || '',
      stderr: r.stderr || String(r.error || ''),
    };
  };
}

/** The line the gate prints after trying to file LOW findings. */
export function lowFindingsLine(result, summaryPath) {
  return result.ok
    ? `[codex-review] ${result.message}\n`
    : `[codex-review] warn: could not file LOW findings (${result.message}); they are in ${summaryPath}\n`;
}

function findingLines(f) {
  return [
    `  [${String(f.severity).toUpperCase()}] ${f.file}:${f.line} — ${f.rule}`,
    `    Issue    : ${f.issue}`,
    `    Evidence : ${f.evidence}`,
    `    Fix      : ${f.fix}`,
    `    Fingerprint: ${f.fingerprint}`,
    '',
  ];
}

/**
 * The verdict of a complete review: the findings.json artifact, the summary text
 * and the LOW / blocking split. Pure; the caller writes the files and exits.
 * @param {{findings: object[], waivers: Map<string, {reason: string}>, baseRef: string,
 *          scopedFiles: string[], reviewerUsed: string, chunkCount: number,
 *          waivedLines: (f: object, waiver: object) => string[], now?: Date}} input
 *   `findings` already carry their fingerprints.
 */
export function reviewReport({
  findings,
  waivers,
  baseRef,
  scopedFiles,
  reviewerUsed,
  chunkCount,
  waivedLines,
  now = new Date(),
}) {
  const { waived, unwaived, low, blocking, verdict } = judge(findings, waivers);
  const artifact = {
    base_ref: baseRef,
    scoped_files: scopedFiles,
    diff_chunks: chunkCount,
    findings,
    waived_count: waived.length,
    unwaived_count: unwaived.length,
    low_count: low.length,
    blocking_count: blocking.length,
    verdict,
  };
  const lines = [
    `Semantic Review (${reviewerUsed}) — ${now.toISOString()}`,
    `Base ref  : ${baseRef}`,
    `Files in scope : ${scopedFiles.length}`,
    `Diff chunks    : ${chunkCount} (each reviewed in full)`,
    `Total findings : ${findings.length}`,
    `  Waived       : ${waived.length}`,
    `  Unwaived     : ${unwaived.length} (${blocking.length} blocking, ${low.length} low)`,
    '',
  ];
  if (blocking.length > 0)
    lines.push('UNWAIVED FINDINGS (BLOCKING):', ...blocking.flatMap(findingLines));
  if (low.length > 0) {
    lines.push('LOW FINDINGS (not blocking, filed as a follow-up):', ...low.flatMap(findingLines));
  }
  if (waived.length > 0) {
    lines.push('WAIVED FINDINGS (suppressed):');
    for (const f of waived) lines.push(...waivedLines(f, waivers.get(f.fingerprint)));
    lines.push('');
  }
  lines.push(`Verdict: ${verdict}`);
  return { artifact, summary: lines.join('\n'), low, blocking, verdict };
}

/** The cache record to store after a fresh review, or null on a reuse. */
export function recordToStore({ cache, baseRef, reviewer, findings, now = new Date() }) {
  if (!cache?.head || !cache?.hash) return null;
  return cacheRecord({ head: cache.head, hash: cache.hash, baseRef, reviewer, findings, now });
}

/**
 * Everything scripts/codex-review.mjs needs for the one-review-per-head cache and
 * the LOW follow-up, bound to this checkout. The script stays wiring only.
 *
 *   lookup()   the cached review of this head + diff, or a miss with the key to
 *              store under. On a hit it prints which review is reused and returns
 *              `reuse`, the arguments for the script's finish().
 *   complete() after fingerprints are stamped: stores a fresh review, writes
 *              findings.json and summary.txt, files LOW findings, and returns
 *              { summary, blocking }.
 */
export function makeReviewIo({
  repoRoot,
  outDir,
  baseRef,
  isInScope,
  spawn,
  fs,
  out = (s) => process.stdout.write(s),
  env = process.env,
  now = () => new Date(),
  scope = () => scopeChanges(baseRef, spawn, isInScope),
  collect = (files) => collectScopedDiff({ baseRef, files, repoRoot, spawn }),
}) {
  const file = (name) => path.join(outDir, name);
  const git = (args) => {
    const r = spawn('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return r.status === 0 ? String(r.stdout).trim() : '';
  };
  const readCache = () =>
    fs.existsSync(file('review-cache.json'))
      ? fs.readFileSync(file('review-cache.json'), 'utf8')
      : '';

  function lookup() {
    const key = lookupReview({
      head: git(['rev-parse', 'HEAD']),
      scope: scope(),
      collect,
      readCache,
      env,
    });
    if (!key.hit) return key;
    out(
      `[codex-review] reusing the ${key.hit.reviewer} review of ${key.head.slice(0, 9)} from ` +
        `${key.hit.reviewed_at} (same head, same diff; ${NO_CACHE_ENV}=1 reviews again)\n`
    );
    const reuse = {
      scopedFiles: key.scopedFiles,
      findings: key.hit.findings,
      reviewerUsed: `${key.hit.reviewer}, reused`,
      chunkCount: 0,
    };
    return { ...key, reuse };
  }

  function complete({
    rawFindings,
    findings,
    waivers,
    cache,
    scopedFiles,
    reviewerUsed,
    chunkCount,
    waivedLines,
  }) {
    const at = now();
    const record = recordToStore({
      cache,
      baseRef,
      reviewer: reviewerUsed,
      findings: rawFindings,
      now: at,
    });
    if (record) fs.writeFileSync(file('review-cache.json'), JSON.stringify(record, null, 2));
    const report = reviewReport({
      findings,
      waivers,
      baseRef,
      scopedFiles,
      reviewerUsed,
      chunkCount,
      waivedLines,
      now: at,
    });
    fs.writeFileSync(file('findings.json'), JSON.stringify(report.artifact, null, 2));
    fs.writeFileSync(file('summary.txt'), report.summary);
    if (report.low.length > 0) {
      const result = recordLowFindings({
        gh: ghRunner(spawn, repoRoot),
        branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
        head: git(['rev-parse', 'HEAD']),
        findings: report.low,
        writeBodyFile: (body) => {
          fs.writeFileSync(file('low-followup.md'), body, 'utf8');
          return file('low-followup.md');
        },
      });
      report.lowLine = lowFindingsLine(result, path.relative(repoRoot, file('summary.txt')));
    }
    return report;
  }

  return { lookup, complete };
}
