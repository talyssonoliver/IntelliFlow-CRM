/**
 * Pure helpers for the pre-ship gate's printed output and last-run.json state.
 * Kept out of scripts/pre-ship.mjs (which runs main() on import) so they can be
 * unit-tested.
 */

/** A non-required step that FAILED: reported as a warning, never as "FAIL". */
export function isAdvisoryFail(r) {
  return r.verdict === 'FAIL' && r.required === false;
}

/** The label printed for a step result (what the per-step line says). */
export function displayVerdict(r, { allowMissing = false } = {}) {
  if (r.verdict === 'SKIPPED_PRECONDITION' && r.required === true && !allowMissing) {
    return 'MISSING';
  }
  if (isAdvisoryFail(r)) return 'WARN';
  // A step that failed an earlier attempt and then passed is not a plain PASS.
  if (r.verdict === 'PASS' && (r.attempts ?? 1) > 1) return 'PASS_AFTER_RETRY';
  return r.verdict;
}

const MARKS = {
  PASS: '✓',
  PASS_AFTER_RETRY: '✓',
  CACHED_PASS: '✓·',
  FAIL: '✗',
  WARN: '!',
  SKIPPED_PRECONDITION: '·',
  SKIPPED_NOT_SELECTED: '-',
  SKIPPED_NOT_FULL: '-',
  NOT_RUN: ' ',
  MISSING: '!',
};

export function mark(label) {
  return MARKS[label] || '?';
}

const LABELS = {
  PASS_AFTER_RETRY: 'PASS (after retry)',
  WARN: 'WARN (advisory, non-blocking)',
};

export function stepLine(r, opts, fmtDuration) {
  const label = displayVerdict(r, opts);
  return `${mark(label)} ${LABELS[label] || label}  (${fmtDuration(r.duration_ms)})`;
}

/**
 * Counts so the summary line agrees with the per-step lines.
 * `expected` is the step ids this run should have covered.
 */
export function summarize(results, expected) {
  const byId = new Map(results.map((r) => [r.id, r]));
  let passed = 0;
  let warned = 0;
  let failed = 0;
  for (const id of expected) {
    const r = byId.get(id);
    if (!r) continue;
    if (r.verdict === 'PASS' || r.verdict === 'CACHED_PASS') passed += 1;
    else if (isAdvisoryFail(r)) warned += 1;
    else if (r.verdict === 'FAIL') failed += 1;
  }
  return { passed, warned, failed, total: expected.length };
}

export function summaryText({ passed, warned, failed, total }) {
  const parts = [`${passed}/${total} steps passed`];
  if (warned > 0) parts.push(`${warned} advisory warning${warned === 1 ? '' : 's'}`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(', ');
}

/**
 * `--only=<ids>` must not erase the rest of the cached run. Merge the freshly
 * run steps into the existing state for the same HEAD (and same test scope —
 * the caller checks that); every other step keeps its cached result. When there
 * is no usable previous state, the new state is returned unchanged.
 *
 * Provenance fields (only/mode/verdict) stay those of the NEW run: a merged
 * file must never read as a complete gate unless a full run produced it. The
 * attestation re-derives completeness from `only` + `steps`, so we keep
 * `only` set whenever this run was a subset run.
 */
export function mergeOnlyState(prev, next, stepIds, ranIds) {
  if (!prev || !Array.isArray(prev.steps) || prev.git_head !== next.git_head) return next;
  const ran = new Map(next.steps.filter((s) => ranIds.has(s.id)).map((s) => [s.id, s]));
  const prevById = new Map(prev.steps.map((s) => [s.id, s]));
  const steps = stepIds.map((id) => {
    if (ran.has(id)) return ran.get(id);
    const old = prevById.get(id);
    // Only genuine results survive; honest skips are re-derived by the next run.
    if (old && (old.verdict === 'PASS' || old.verdict === 'FAIL')) return old;
    return next.steps.find((s) => s.id === id) ?? { id, verdict: 'NOT_RUN', duration_ms: 0 };
  });
  return { ...next, steps };
}
