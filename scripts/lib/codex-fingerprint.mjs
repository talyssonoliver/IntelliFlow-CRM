/**
 * Source-anchored fingerprints and waiver rules for the semantic review gate
 * (scripts/codex-review.mjs). See #980.
 *
 * A finding's fingerprint is the minimum per-line hash over the reported line
 * +-FP_DRIFT, because the reviewer sometimes reports a line one or two away from
 * the bug:
 *
 *   sha256( normalizedFilePath + "\n" + normalizedLine )
 *
 * Only an eligible line can be that anchor: it has real content and appears once
 * in its file. Without this rule a waiver could land on a `}` and hide most of the
 * file (24c6b825 hid 134 of 829 lines), and it would survive a fix of the bug.
 *
 * With no eligible line in the window, the fingerprint hashes the whole window.
 * It then matches only that exact code at that exact position, so a line shift
 * re-blocks instead of hiding anything else.
 *
 * Known limit, which comes with the drift tolerance: two findings within a few
 * lines of one anchor still share a fingerprint, and a waiver anchored on a
 * neighbouring line survives a fix of the flagged line. The gate prints each
 * waiver's reason beside the finding it hid so that a mismatch can be seen.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Tolerated distance between the reported line and the bug. */
export const FP_DRIFT = 2;

/** `}`, `*`, `/**`, `});`, `id,` and `try {` are below this; `return;` and `data: {` are not. */
const MIN_IDENTIFIER_CHARS = 4;

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export const normalizeFilePath = (file) => file.replace(/\\/g, '/').toLowerCase().trim();

export const normalizeLine = (line) => line.trim().replace(/\s+/g, ' ');

/** Whether a normalized line has enough content to identify code. */
export function isSubstantialLine(normalized) {
  return (normalized.match(/\w/g) ?? []).length >= MIN_IDENTIFIER_CHARS;
}

export function lineHash(normalizedFile, normalized) {
  return sha256(`${normalizedFile}\n${normalized}`);
}

function countLines(normalizedLines) {
  const counts = new Map();
  for (const line of normalizedLines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/** Parses an integer or "N-M" line spec. Returns null when there is no usable line. */
export function parseLineSpec(line) {
  const text = String(line).trim();
  const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(text);
  if (range) return { start: Number(range[1]), end: Number(range[2]) };
  const n = Number.parseInt(text, 10);
  return Number.isNaN(n) || n < 1 ? null : { start: n, end: n };
}

/**
 * The fingerprint of a finding at `lineSpec` in a file's text, or null when the
 * window holds no source (the caller then falls back to the issue text).
 */
export function sourceFingerprint(file, lineSpec, text) {
  const spec = parseLineSpec(lineSpec);
  if (!spec) return null;

  const normalizedFile = normalizeFilePath(file);
  const lines = text.split('\n').map(normalizeLine);
  const counts = countLines(lines);
  const from = Math.max(1, spec.start - FP_DRIFT);
  const to = Math.min(lines.length, spec.end + FP_DRIFT);
  const window = lines.slice(from - 1, to).filter(Boolean);
  if (window.length === 0) return null;

  const eligible = window.filter((line) => isSubstantialLine(line) && counts.get(line) === 1);
  if (eligible.length > 0) {
    return eligible.map((line) => lineHash(normalizedFile, line)).sort()[0];
  }
  return sha256(`${normalizedFile}\nwindow:${window.join('\n')}`);
}

/** Prose fallback, for a file or line that cannot be read. */
function proseFingerprint(file, issue) {
  const prose = issue
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['"`.]/g, '')
    .trim();
  return sha256(`${normalizeFilePath(file)}\nprose:${prose}`);
}

/** The fingerprint of a finding as the reviewer reported it. */
export function fingerprint(file, line, issue, repoRoot) {
  let fromSource = null;
  try {
    const absPath = path.join(repoRoot, file);
    if (fs.existsSync(absPath)) {
      fromSource = sourceFingerprint(file, line, fs.readFileSync(absPath, 'utf8'));
    }
  } catch {
    // Unreadable: use the prose fallback, which cannot match a source anchor.
  }
  return fromSource ?? proseFingerprint(file, issue);
}

const WAIVER_START = /^-\s?fingerprint:\s?["']?([a-f0-9]{64})["']?$/;
const WAIVER_EXPIRES = /^\s+expires\s*:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/;
const WAIVER_OTHER_FIELD = /^\s+(author|date|expires)\s*:/;

const isComment = (line) => /^\s*#/.test(line);

/** Parses the waiver file without a YAML dependency. */
export function parseWaivers(raw) {
  const waivers = [];
  let current = null;
  let inReason = false;
  for (const line of raw.split(/\r?\n/)) {
    if (isComment(line)) continue;
    const start = WAIVER_START.exec(line.trim());
    if (start) {
      current = { fingerprint: start[1], expires: null, reason: '' };
      waivers.push(current);
      inReason = false;
    } else if (current) {
      inReason = readWaiverField(current, line, inReason);
    }
  }
  return waivers;
}

/** Applies one line to a waiver and says whether the reason continues after it. */
function readWaiverField(waiver, line, inReason) {
  const trimmed = line.trim();
  if (line !== trimmed && trimmed.startsWith('reason:')) {
    const value = trimmed.slice('reason:'.length).trim();
    waiver.reason = /^[>|]/.test(value) ? '' : value.replace(/^['"]|['"]$/g, '');
    return true;
  }
  const expires = WAIVER_EXPIRES.exec(line);
  if (expires) waiver.expires = expires[1];
  if (WAIVER_OTHER_FIELD.test(line)) return false;
  if (inReason && line.trim()) {
    waiver.reason = `${waiver.reason} ${line.trim()}`.trim();
    return true;
  }
  return inReason;
}

export const isExpired = (waiver, today) => Boolean(waiver.expires && waiver.expires < today);

/**
 * What each waiver anchors on, across a set of `{ path, text }` files:
 *   ok         one eligible line
 *   ineligible a trivial or repeated line: it matches nothing and must go
 *   expired    past its date: the gate ignores it
 *   unanchored no line hashes to it: the code changed, or it hashes a window or prose
 */
export function classifyWaivers(waivers, files, today) {
  const wanted = new Set(waivers.map((w) => w.fingerprint));
  const anchors = new Map();
  for (const { path: file, text } of files) {
    const normalizedFile = normalizeFilePath(file);
    const lines = text.split('\n').map(normalizeLine).filter(Boolean);
    const counts = countLines(lines);
    for (const [line, count] of counts) {
      const hash = lineHash(normalizedFile, line);
      if (wanted.has(hash)) anchors.set(hash, { file, line, count });
    }
  }
  return waivers.map((waiver) => {
    const anchor = anchors.get(waiver.fingerprint) ?? null;
    return { waiver, anchor, status: waiverStatus(waiver, anchor, today) };
  });
}

function waiverStatus(waiver, anchor, today) {
  if (isExpired(waiver, today)) return 'expired';
  if (!anchor) return 'unanchored';
  return isSubstantialLine(anchor.line) && anchor.count === 1 ? 'ok' : 'ineligible';
}

const MAX_SOURCE_BYTES = 3_000_000;

/** The tracked text files of a repo, as `{ path, text }`. Skips binaries and huge artifacts. */
export function readTrackedFiles(repoRoot) {
  const listed = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return listed
    .split('\0')
    .filter(Boolean)
    .flatMap((file) => {
      const text = readSourceFile(path.join(repoRoot, file));
      return text === null ? [] : [{ path: file, text }];
    });
}

function readSourceFile(absPath) {
  try {
    const stat = fs.lstatSync(absPath);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return null;
    const bytes = fs.readFileSync(absPath);
    return bytes.includes(0) ? null : bytes.toString('utf8');
  } catch {
    return null; // Listed but deleted in the working tree.
  }
}

/**
 * Checks the waiver list against the tree. Returns the lines to print and whether
 * the gate must fail: only an ineligible anchor fails. An expired or unanchored
 * waiver already matches nothing, and failing on a date or on someone's refactor
 * would turn unrelated pushes red.
 */
export function checkWaivers(raw, files, today) {
  const rows = classifyWaivers(parseWaivers(raw), files, today);
  const count = (status) => rows.filter((row) => row.status === status).length;
  const ineligible = rows.filter((row) => row.status === 'ineligible');
  const lines = [
    `[codex-review] waivers: ${rows.length} (ok ${count('ok')}, ineligible ${ineligible.length}, ` +
      `unanchored ${count('unanchored')}, expired ${count('expired')})`,
    ...ineligible.map(
      ({ waiver, anchor }) =>
        `  INELIGIBLE ${waiver.fingerprint.slice(0, 12)} anchors on ${JSON.stringify(anchor.line)}, ` +
        `${anchor.count} time(s) in ${anchor.file}. It matches nothing: remove it, and if the finding ` +
        `comes back, waive it again with its new fingerprint.`
    ),
  ];
  return { ok: ineligible.length === 0, lines };
}

/**
 * The waivers in force, by fingerprint. An expired waiver is reported through
 * `warn` and left out, so its finding blocks again.
 *
 * @param {string} raw
 * @param {string} today YYYY-MM-DD
 * @param {(message: string) => void} warn
 * @returns {Map<string, ReturnType<typeof parseWaivers>[number]>}
 */
export function activeWaivers(raw, today, warn) {
  const active = new Map();
  for (const waiver of parseWaivers(raw)) {
    if (isExpired(waiver, today)) {
      warn(
        `[codex-review] WARN: waiver ${waiver.fingerprint.slice(0, 12)}... expired ${waiver.expires} — treating as not waived\n`
      );
    } else {
      active.set(waiver.fingerprint, waiver);
    }
  }
  return active;
}

/** How a waived finding reads in the summary: the waiver's reason sits beside the claim. */
export function waivedFindingLines(finding, waiver) {
  return [
    `  [${finding.severity.toUpperCase()}] ${finding.file}:${finding.line} — ${finding.rule} (fp: ${finding.fingerprint.slice(0, 12)}...)`,
    `    Issue  : ${finding.issue}`,
    `    Waiver : ${waiver.reason}`,
  ];
}
