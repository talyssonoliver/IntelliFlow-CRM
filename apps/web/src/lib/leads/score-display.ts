/**
 * #1218: how a lead's AI score is shown. A stored 0 is only a score when the scoring status says
 * so: a lead that was never scored, or whose last scoring failed, shows as not scored instead of
 * a red 0.
 */
export type LeadScoringStatus = 'NONE' | 'SCORED' | 'NEEDS_REVIEW' | 'FAILED';

export type LeadScoreDisplay =
  | { kind: 'score'; score: number; needsReview: boolean }
  | { kind: 'not-scored'; label: string; title: string };

export function leadScoreDisplay(
  score: number | null | undefined,
  scoringStatus: LeadScoringStatus | string | null | undefined
): LeadScoreDisplay {
  if (scoringStatus === 'SCORED' || scoringStatus === 'NEEDS_REVIEW') {
    return { kind: 'score', score: score ?? 0, needsReview: scoringStatus === 'NEEDS_REVIEW' };
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
