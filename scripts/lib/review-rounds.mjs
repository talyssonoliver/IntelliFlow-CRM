/**
 * Stops the review back and forth (owner ruling 2026-11-26: "keep going back and forth with no
 * reasoning metrics"). Two rules, both pure and unit-tested:
 *
 *  - DELTA. A branch keeps a record of every hunk a review has seen (artifacts/codex-review/
 *    round-state.json, keyed by branch). A new round sends the reviewer ONLY hunks it has not seen:
 *    a hunk is its +/- lines per file, so a push that moves line numbers or merges main does not
 *    make old code look new. Unresolved findings whose hunk is unchanged are carried forward and
 *    still judged against the waivers; a finding whose hunk changed is dropped and the new code is
 *    reviewed instead.
 *
 *  - ROUND LIMIT. After MAX_ROUNDS failed model rounds on one branch the gate stops and prints a
 *    human route (owner/orchestrator decides). It never waives anything itself; CODEX_REVIEW_MAX_ROUNDS
 *    raises the limit, which is the owner's or orchestrator's call. A PASS resets the count.
 */
import crypto from 'node:crypto';

export const STATE_VERSION = 1;
export const DEFAULT_MAX_ROUNDS = 4;

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * One file section split into its header and hunks. `hash` covers the file and the +/- lines only
 * (not the @@ line numbers or the context), `start`/`end` are the hunk's lines in the new file.
 */
export function splitHunks(section) {
  const first = section.text.search(/^@@ /m);
  if (first === -1) {
    // No hunk (a binary file, a mode change): the whole section is one unit.
    return {
      header: section.text,
      hunks: [
        {
          file: section.file,
          text: '',
          hash: sha(`${section.file}\0${section.text}`),
          start: 0,
          end: 0,
        },
      ],
      whole: true,
    };
  }
  const header = section.text.slice(0, first);
  const hunks = section.text
    .slice(first)
    .split(/^(?=@@ )/m)
    .filter(Boolean)
    .map((text) => {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(text);
      const start = m ? Number.parseInt(m[1], 10) : 0;
      const len = m && m[2] !== undefined ? Number.parseInt(m[2], 10) : 1;
      const changed = text
        .split('\n')
        .slice(1)
        .filter((l) => l.startsWith('+') || l.startsWith('-'))
        .join('\n');
      return {
        file: section.file,
        text,
        hash: sha(`${section.file}\0${changed}`),
        start,
        end: start + Math.max(len, 1) - 1,
      };
    });
  return { header, hunks, whole: false };
}

/** Every hunk of every section: [{ file, header, text, hash, start, end }]. */
export function allHunks(sections) {
  return sections.flatMap((s) => {
    const { header, hunks } = splitHunks(s);
    return hunks.map((h) => ({ ...h, header }));
  });
}

/** The hash of the hunk of `file` containing the finding's line, or null (line outside every hunk). */
export function hunkForFinding(finding, hunks) {
  const first = Number.parseInt(String(finding.line).split('-')[0], 10);
  if (!Number.isFinite(first)) return null;
  const hit = hunks.find((h) => h.file === finding.file && first >= h.start && first <= h.end);
  return hit ? hit.hash : null;
}

/** An empty branch record. */
export const emptyBranch = () => ({
  rounds: 0,
  lastHead: null,
  reviewedHunks: [],
  findings: [],
  lastRound: null,
});

/** The branch's record from the state file text ('' or garbled: a fresh one). */
export function loadBranch(text, branch) {
  try {
    const s = JSON.parse(text);
    if (s && s.version === STATE_VERSION && s.branches && s.branches[branch]) {
      return { ...emptyBranch(), ...s.branches[branch] };
    }
  } catch {
    // unreadable: start again
  }
  return emptyBranch();
}

/** The state file text with `record` stored under `branch` (other branches kept). */
export function storeBranch(text, branch, record) {
  let branches = {};
  try {
    const s = JSON.parse(text);
    if (s && s.version === STATE_VERSION && s.branches) branches = s.branches;
  } catch {
    // start again
  }
  return JSON.stringify(
    { version: STATE_VERSION, branches: { ...branches, [branch]: record } },
    null,
    2
  );
}

/** The round limit from the env, default DEFAULT_MAX_ROUNDS. */
export function maxRounds(env = process.env) {
  const n = Number.parseInt(env.CODEX_REVIEW_MAX_ROUNDS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ROUNDS;
}

/** The stop message after the round limit, with the human route. */
export function roundLimitMessage({ branch, rounds, limit, findings }) {
  const open = findings.filter((f) => String(f.severity).toLowerCase() !== 'low');
  const list = open
    .slice(0, 8)
    .map((f) => `  - [${String(f.severity).toUpperCase()}] ${f.file}:${f.line} ${f.rule}`)
    .join('\n');
  return (
    `ROUND_LIMIT: ${rounds} semantic-review rounds on ${branch} (limit ${limit}) and the gate still does not pass. ` +
    'Gate FAIL - stopped, nothing waived and nothing re-reviewed.\n' +
    (list ? `Open findings:\n${list}\n` : '') +
    'Human route: the owner or the orchestrator decides. Read artifacts/codex-review/metrics.jsonl ' +
    '(node scripts/codex-review-metrics.mjs) to see which findings were real. Then either fix them, ' +
    'add a waiver with a reason and author, or raise the limit for this branch with ' +
    'CODEX_REVIEW_MAX_ROUNDS=<n>. Do not keep pushing.'
  );
}

/**
 * Splits the current diff against the branch record.
 * @returns {{review: {file: string, text: string}[], newHunks: number, seenHunks: number,
 *   carried: object[], dropped: object[], current: Set<string>}}
 *   `review`: sections holding only unseen hunks (each repeats its file header);
 *   `carried`: earlier findings whose hunk is unchanged; `dropped`: earlier findings whose hunk
 *   changed or went away (the code they flagged was acted on).
 */
export function deltaAgainst(sections, branchRecord) {
  const seen = new Set(branchRecord.reviewedHunks);
  const hunks = allHunks(sections);
  const current = new Set(hunks.map((h) => h.hash));
  const newByFile = new Map();
  let newHunks = 0;
  for (const h of hunks) {
    if (seen.has(h.hash)) continue;
    newHunks += 1;
    const entry = newByFile.get(h.file) ?? { header: h.header, bodies: [] };
    entry.bodies.push(h.text);
    newByFile.set(h.file, entry);
  }
  const review = [...newByFile.entries()].map(([file, e]) => ({
    file,
    text: e.header + e.bodies.join(''),
  }));
  const changedFiles = new Set(review.map((s) => s.file));
  const carried = [];
  const dropped = [];
  for (const f of branchRecord.findings) {
    const keep = f.hunk ? current.has(f.hunk) : !changedFiles.has(f.file);
    (keep ? carried : dropped).push(f);
  }
  return { review, newHunks, seenHunks: hunks.length - newHunks, carried, dropped, current };
}

/** Attaches the hunk hash to each finding of a round (for carrying it into the next one). */
export function withHunks(findings, sections) {
  const hunks = allHunks(sections);
  return findings.map((f) => ({ ...f, hunk: hunkForFinding(f, hunks) }));
}

/**
 * The branch record after a completed round.
 * @param {object} p
 * @param {object} p.prev the record before the round
 * @param {string} p.head HEAD sha
 * @param {object[]} p.sections the whole current diff (every hunk now counts as reviewed)
 * @param {object[]} p.findings carried + new findings, each with `hunk`
 * @param {boolean} p.modelRound false when no model ran (nothing new, or a skip)
 * @param {boolean} p.pass the verdict
 */
export function nextBranchRecord({ prev, head, sections, findings, modelRound, pass }) {
  const hashes = [...new Set(allHunks(sections).map((h) => h.hash))];
  const rounds = pass ? 0 : prev.rounds + (modelRound ? 1 : 0);
  return {
    rounds,
    lastHead: head,
    reviewedHunks: hashes,
    findings: pass ? findings.filter((f) => String(f.severity).toLowerCase() === 'low') : findings,
    lastRound: { round: prev.rounds + (modelRound ? 1 : 0), head, at: new Date().toISOString() },
  };
}

/** The shape written into the metrics file's `previous_round`: what the next push did with them. */
export function previousRoundOutcome(prev, dropped, carried) {
  if (!prev.lastRound) return null;
  const total = dropped.length + carried.length;
  return {
    round: prev.lastRound.round,
    findings: total,
    changed_code: dropped.length,
    unchanged: carried.length,
    changed: dropped.map((f) => ({
      file: f.file,
      line: f.line,
      severity: f.severity,
      rule: f.rule,
    })),
  };
}
