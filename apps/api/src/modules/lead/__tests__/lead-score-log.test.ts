import { describe, it, expect, vi } from 'vitest';
import {
  hadRealScore,
  isNoOpRescore,
  isRealScoringStatus,
  readScoringState,
  scoreUpdateActivity,
  type LeadScoringState,
  type ScoreRunResult,
} from '../lead-score-log';

const state = (status: string | null, scoredAt: Date | null = null): LeadScoringState => ({
  status,
  scoredAt,
});
const SCORED_AT = new Date('2026-11-01T09:00:00.000Z');

const result = (over: Partial<ScoreRunResult> = {}): ScoreRunResult => ({
  leadId: 'lead-1',
  previousScore: 50,
  newScore: 80,
  confidence: 0.85,
  tier: 'hot',
  autoQualified: false,
  autoDisqualified: false,
  ...over,
});

describe('isRealScoringStatus', () => {
  it('is true for SCORED and NEEDS_REVIEW only', () => {
    expect(isRealScoringStatus('SCORED')).toBe(true);
    expect(isRealScoringStatus('NEEDS_REVIEW')).toBe(true);
    for (const s of ['NONE', 'FAILED', '', null, undefined]) {
      expect(isRealScoringStatus(s)).toBe(false);
    }
  });
});

describe('hadRealScore', () => {
  it('is true for a scored lead', () => {
    expect(hadRealScore(state('SCORED', SCORED_AT))).toBe(true);
    expect(hadRealScore(state('NEEDS_REVIEW'))).toBe(true);
  });

  it('is true for a FAILED lead that still holds its earlier score (scoredAt)', () => {
    expect(hadRealScore(state('FAILED', SCORED_AT))).toBe(true);
  });

  it('is false for a lead never scored, and for an unknown state', () => {
    expect(hadRealScore(state('NONE'))).toBe(false);
    expect(hadRealScore(state('FAILED'))).toBe(false);
    expect(hadRealScore(null)).toBe(false);
  });
});

describe('readScoringState', () => {
  const prisma = (findUnique: () => Promise<unknown>) => ({ lead: { findUnique } }) as never;

  it('reads the status and scoredAt of the lead', async () => {
    const findUnique = vi.fn(async () => ({ scoringStatus: 'SCORED', scoredAt: SCORED_AT }));
    await expect(readScoringState(prisma(findUnique), 'lead-1')).resolves.toEqual({
      status: 'SCORED',
      scoredAt: SCORED_AT,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      select: { scoringStatus: true, scoredAt: true },
    });
  });

  it('is null for a lead that is not there, and when the read fails', async () => {
    await expect(
      readScoringState(
        prisma(async () => null),
        'lead-1'
      )
    ).resolves.toBeNull();
    await expect(
      readScoringState(
        prisma(async () => Promise.reject(new Error('down'))),
        'lead-1'
      )
    ).resolves.toBeNull();
  });
});

describe('isNoOpRescore', () => {
  const scored = state('SCORED', SCORED_AT);

  it('is true when the score, the status and the qualification are all unchanged', () => {
    expect(isNoOpRescore(scored, scored, result({ previousScore: 50, newScore: 50 }))).toBe(true);
  });

  it('is false when the score changed', () => {
    expect(isNoOpRescore(scored, scored, result({ previousScore: 50, newScore: 51 }))).toBe(false);
  });

  it('is false when the status moved, even with the same score', () => {
    expect(
      isNoOpRescore(
        scored,
        state('NEEDS_REVIEW', SCORED_AT),
        result({ previousScore: 50, newScore: 50 })
      )
    ).toBe(false);
  });

  it('is false when the run qualified or disqualified the lead', () => {
    const same = { previousScore: 50, newScore: 50 };
    expect(isNoOpRescore(scored, scored, result({ ...same, autoQualified: true }))).toBe(false);
    expect(isNoOpRescore(scored, scored, result({ ...same, autoDisqualified: true }))).toBe(false);
  });

  it('is false for a first score, a FAILED lead, and an unknown prior state', () => {
    const same = result({ previousScore: 0, newScore: 0 });
    expect(isNoOpRescore(state('NONE'), scored, same)).toBe(false);
    expect(isNoOpRescore(state('FAILED', SCORED_AT), scored, same)).toBe(false);
    expect(isNoOpRescore(null, scored, same)).toBe(false);
  });
});

describe('scoreUpdateActivity', () => {
  const who = { tenantId: 'tenant-1', userId: 'user-1' };
  const scored = state('SCORED', SCORED_AT);

  it('builds the "Lead Scored by AI" row, marking a first score', () => {
    const row = scoreUpdateActivity(state('NONE'), scored, result({ previousScore: 0 }), who);
    expect(row).toMatchObject({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      type: 'SCORE_UPDATE',
      title: 'Lead Scored by AI',
      description: 'Score 80 (hot) at 85% confidence',
      userId: 'user-1',
      userName: 'AI Scoring Agent',
    });
    expect(row?.metadata).toMatchObject({ previousScore: 0, newScore: 80, firstScore: true });
  });

  it('says it was not a first score for a lead that held one', () => {
    const row = scoreUpdateActivity(scored, scored, result(), who);
    expect(row?.metadata).toMatchObject({ previousScore: 50, newScore: 80, firstScore: false });
  });

  it('makes no first-score claim when the prior state is unknown', () => {
    const row = scoreUpdateActivity(null, scored, result(), who);
    expect(row).not.toBeNull();
    expect(row?.metadata).not.toHaveProperty('firstScore');
  });

  it('is null for a re-score that changed nothing', () => {
    expect(
      scoreUpdateActivity(scored, scored, result({ previousScore: 50, newScore: 50 }), who)
    ).toBeNull();
  });
});
