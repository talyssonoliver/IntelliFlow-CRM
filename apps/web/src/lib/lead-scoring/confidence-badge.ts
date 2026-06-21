/**
 * Confidence badge — shared presentation mapping for a 0–100 confidence score.
 *
 * Extracted from two near-identical copies that had DRIFTED at the zero edge
 * (`agent-approvals/page.tsx` always showed "Low Confidence"; the preview page
 * hid the badge for an unscored/zero action). Centralising it removes that drift
 * and gives the threshold logic a single, deterministic UNIT-test home — the
 * boundary cases (80 = High, 60 = Medium, 79/59) were previously only asserted
 * through the browser in `tests/e2e/ai-features/ai-scoring.spec.ts`, which is the
 * wrong layer for pure threshold logic.
 */
export interface ConfidenceBadge {
  label: string;
  className: string;
}

const HIGH: ConfidenceBadge = {
  label: 'High Confidence',
  className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};
const MEDIUM: ConfidenceBadge = {
  label: 'Medium Confidence',
  className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};
const LOW: ConfidenceBadge = {
  label: 'Low Confidence',
  className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};
const NONE: ConfidenceBadge = { label: '', className: '' };

/**
 * Map a confidence score (0–100) to its badge.
 *
 * Thresholds: `>= 80` High, `>= 60` Medium, otherwise Low.
 *
 * @param opts.hideWhenZero When true, a score `<= 0` returns an EMPTY badge so
 *   the caller can hide it (the agent-approvals preview suppresses the badge for
 *   an unscored/zero action). Default keeps the legacy main-page behaviour of
 *   always returning a Low-confidence badge.
 */
export function getConfidenceBadge(
  score: number,
  opts: { hideWhenZero?: boolean } = {}
): ConfidenceBadge {
  if (score >= 80) return HIGH;
  if (score >= 60) return MEDIUM;
  if (opts.hideWhenZero && score <= 0) return NONE;
  return LOW;
}
