/**
 * Single source of truth for the Plan-Reviewer subagent marker.
 *
 * The marker `<!-- plan-reviewer: subagent -->` is emitted by the
 * plan-reviewer.md output template into a plan's "Plan-Reviewer Sign-off"
 * section. Two gates verify it:
 *   - tools/scripts/exec-preflight/check-plan-reviewer-subagent.mjs (the plan-side gate)
 *   - tools/scripts/exec-preflight/check-attestation-provenance.mjs (cross-checks the
 *     attestation's plan_path file for the same marker — NP-5).
 *
 * Defining the regex here (not inline in each gate) keeps it to ONE definition
 * so the two gates can never drift apart (AUTOMATION-003 / NF-003).
 */

export const PLAN_REVIEWER_SUBAGENT_MARKER_RE = /<!--\s*plan-reviewer\s*:\s*subagent\s*-->/i;

/** True if `content` contains the canonical plan-reviewer subagent marker. */
export function hasPlanReviewerSubagentMarker(content) {
  return PLAN_REVIEWER_SUBAGENT_MARKER_RE.test(String(content ?? ''));
}
