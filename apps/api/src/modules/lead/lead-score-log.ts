/**
 * What `lead.scoreWithAI` logs on the lead after a successful scoring (UI-021).
 *
 * Every scoring wrote a "Lead Scored by AI" row, including a re-score that changed nothing, and
 * nothing said whether it was the lead's first real score. The row now carries `firstScore`, and
 * a re-score of an already-scored lead that left the score and status as they were is not logged
 * as a change (the new confidence is still saved on the lead by the scoring itself).
 */

import type { PrismaClient } from '@intelliflow/db';

/** A scoring status that means the lead holds a real score (not NONE or FAILED). */
export function isRealScoringStatus(status: string | null | undefined): boolean {
  return status === 'SCORED' || status === 'NEEDS_REVIEW';
}

/** The lead's scoring state, read around a scoring run. */
export interface LeadScoringState {
  status: string | null;
  /** Set by every successful scoring (#1218); a FAILED lead keeps it from its last real score. */
  scoredAt: Date | null;
}

/**
 * Whether the lead held a real score before this run. A lead whose last attempt FAILED still
 * holds its earlier real score (#1218 keeps it), which `scoredAt` records, so its next
 * successful score is a change from that score, not a first score.
 */
export function hadRealScore(state: LeadScoringState | null): boolean {
  if (!state) return false;
  return isRealScoringStatus(state.status) || state.scoredAt !== null;
}

/** The lead's scoring status and scoredAt, or null when they cannot be read. */
export async function readScoringState(
  prisma: Pick<PrismaClient, 'lead'>,
  leadId: string
): Promise<LeadScoringState | null> {
  try {
    const row = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { scoringStatus: true, scoredAt: true },
    });
    return row ? { status: row.scoringStatus ?? null, scoredAt: row.scoredAt ?? null } : null;
  } catch {
    return null;
  }
}

/** The part of a scoring result the log reads. */
export interface ScoreRunResult {
  leadId: string;
  previousScore: number;
  newScore: number;
  confidence: number;
  tier: string;
  autoQualified: boolean;
  autoDisqualified: boolean;
}

/**
 * True when a re-score of an already-scored lead changed nothing a user sees: same score, same
 * scoring status (a move between SCORED and NEEDS_REVIEW is a change), and no automatic
 * qualify or disqualify.
 */
export function isNoOpRescore(
  before: LeadScoringState | null,
  after: LeadScoringState | null,
  result: Pick<ScoreRunResult, 'previousScore' | 'newScore' | 'autoQualified' | 'autoDisqualified'>
): boolean {
  return (
    hadRealScore(before) &&
    isRealScoringStatus(before?.status) &&
    before?.status === after?.status &&
    result.previousScore === result.newScore &&
    !result.autoQualified &&
    !result.autoDisqualified
  );
}

/**
 * The SCORE_UPDATE activity to log for a successful scoring, or null for a re-score that changed
 * nothing. An unknown prior state (the read failed) makes no first-score claim either way.
 */
export function scoreUpdateActivity(
  before: LeadScoringState | null,
  after: LeadScoringState | null,
  result: ScoreRunResult,
  who: { tenantId: string; userId: string }
) {
  if (isNoOpRescore(before, after, result)) return null;
  return {
    leadId: result.leadId,
    tenantId: who.tenantId,
    type: 'SCORE_UPDATE' as const,
    title: 'Lead Scored by AI',
    description: `Score ${result.newScore} (${result.tier}) at ${(result.confidence * 100).toFixed(0)}% confidence`,
    metadata: {
      previousScore: result.previousScore,
      newScore: result.newScore,
      ...(before ? { firstScore: !hadRealScore(before) } : {}),
      confidence: result.confidence,
      tier: result.tier,
      autoQualified: result.autoQualified,
      autoDisqualified: result.autoDisqualified,
    },
    userId: who.userId,
    userName: 'AI Scoring Agent',
  };
}
