/**
 * #1218: how a lead's AI score is shown. A stored 0 is only a score when the scoring status says
 * so: a lead that was never scored, or whose last scoring failed, shows as not scored instead of
 * a red 0.
 */
export type LeadScoringStatus = 'NONE' | 'SCORED' | 'NEEDS_REVIEW' | 'FAILED';

/**
 * Display bands for a score's confidence (register #49). The 0.85 gate in the domain
 * (requiresHumanReview) still decides every automatic action; these bands only decide what is
 * shown. A cold lead always scores below 0.85, so flagging all of them in red said nothing.
 *   - below 0.6: red "?" (confidence is really low)
 *   - 0.6 to below 0.85: quiet grey "Few signals yet"
 *   - 0.85 and above: no flag
 */
export const LOW_CONFIDENCE_BELOW = 0.6;
export const REVIEW_CONFIDENCE_BELOW = 0.85;

export type LeadScoreFlag = 'none' | 'few-signals' | 'low-confidence';

export const FEW_SIGNALS_LABEL = 'Few signals yet';
export const FEW_SIGNALS_TITLE =
  'This score is based on little activity so far. It will firm up as the lead engages.';
export const LOW_CONFIDENCE_LABEL = 'Low confidence';
export const LOW_CONFIDENCE_TITLE =
  'Low confidence: the AI had very little to go on, so check this score before relying on it.';

/**
 * The flag for a real score. A stored confidence decides it. Today the lead row does not store
 * the confidence (only its NEEDS_REVIEW status, which means "below 0.85"), so a NEEDS_REVIEW
 * lead without a known confidence gets the quiet grey flag, never the red one: red needs
 * evidence that the confidence is really low.
 */
export function leadScoreFlag(
  scoringStatus: LeadScoringStatus | string | null | undefined,
  confidence?: number | null
): LeadScoreFlag {
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    if (confidence < LOW_CONFIDENCE_BELOW) return 'low-confidence';
    if (confidence < REVIEW_CONFIDENCE_BELOW) return 'few-signals';
    return 'none';
  }
  return scoringStatus === 'NEEDS_REVIEW' ? 'few-signals' : 'none';
}

export type LeadScoreDisplay =
  | { kind: 'score'; score: number; needsReview: boolean; flag: LeadScoreFlag }
  | { kind: 'not-scored'; label: string; title: string };

export function leadScoreDisplay(
  score: number | null | undefined,
  scoringStatus: LeadScoringStatus | string | null | undefined,
  confidence?: number | null
): LeadScoreDisplay {
  if (scoringStatus === 'SCORED' || scoringStatus === 'NEEDS_REVIEW') {
    return {
      kind: 'score',
      score: score ?? 0,
      needsReview: scoringStatus === 'NEEDS_REVIEW',
      flag: leadScoreFlag(scoringStatus, confidence),
    };
  }
  if (scoringStatus === 'FAILED') {
    return {
      kind: 'not-scored',
      label: 'Not scored',
      title: 'The last AI scoring gave no usable score. It will be tried again.',
    };
  }
  // NONE, or a row read before the status existed.
  return { kind: 'not-scored', label: 'Not scored', title: 'This lead has not been scored yet.' };
}
