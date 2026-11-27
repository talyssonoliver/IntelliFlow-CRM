/**
 * lead.scoreWithAI — what it logs on the lead (UI-021).
 *
 * A first score is marked as one, a re-score that changed nothing is not logged as a change, and
 * a status move, an automatic qualify or a FAILED lead's first success after an earlier score
 * still are. An unreadable prior state makes no first-score claim.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leadRouter } from '../lead.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

vi.mock('../../notifications/notifications.router', () => ({
  createNotification: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@intelliflow/adapters', () => ({
  detectScoreBias: vi.fn().mockResolvedValue(null),
}));

const SCORED_AT = new Date('2026-11-01T09:00:00.000Z');

const scoreResult = (over: Record<string, unknown> = {}) => ({
  leadId: TEST_UUIDS.lead1,
  previousScore: 50,
  newScore: 80,
  confidence: 0.85,
  tier: 'hot' as const,
  autoQualified: false,
  autoDisqualified: false,
  ...over,
});

function setup(
  before: { scoringStatus: string; scoredAt: Date | null } | 'unreadable',
  after: { scoringStatus: string; scoredAt: Date | null },
  result = scoreResult()
) {
  const ctx = createTestContext();
  ctx.services!.lead!.scoreLead = vi
    .fn()
    .mockResolvedValue({ isSuccess: true, isFailure: false, value: result });
  if (before === 'unreadable') {
    prismaMock.lead.findUnique.mockRejectedValueOnce(new Error('connection reset'));
  } else {
    prismaMock.lead.findUnique.mockResolvedValueOnce(before as never);
  }
  prismaMock.lead.findUnique.mockResolvedValueOnce(after as never);
  return leadRouter.createCaller(ctx);
}

/** The metadata of every "Lead Scored by AI" row written. */
function scoredRows() {
  return prismaMock.leadActivity.create.mock.calls
    .map((c) => (c[0] as { data: { title: string; metadata?: Record<string, unknown> } }).data)
    .filter((d) => d.title === 'Lead Scored by AI');
}

describe('lead.scoreWithAI activity log', () => {
  beforeEach(() => {
    prismaMock.leadActivity.create.mockClear();
    prismaMock.leadActivity.create.mockResolvedValue({} as never);
  });

  it("marks a lead's first real score as a first score", async () => {
    const caller = setup(
      { scoringStatus: 'NONE', scoredAt: null },
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT },
      scoreResult({ previousScore: 0, newScore: 38 })
    );

    await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

    expect(scoredRows()).toHaveLength(1);
    expect(scoredRows()[0]?.metadata).toMatchObject({
      previousScore: 0,
      newScore: 38,
      firstScore: true,
    });
  });

  it('logs a re-score that changed the score, not as a first score', async () => {
    const caller = setup(
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT },
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT }
    );

    await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

    expect(scoredRows()).toHaveLength(1);
    expect(scoredRows()[0]?.metadata).toMatchObject({
      previousScore: 50,
      newScore: 80,
      firstScore: false,
    });
  });

  it('does not log a re-score that left the score and status as they were', async () => {
    const caller = setup(
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT },
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT },
      scoreResult({ previousScore: 50, newScore: 50 })
    );

    const answer = await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

    expect(scoredRows()).toHaveLength(0);
    // The scoring itself still answers with the new score and confidence.
    expect(answer.score).toBe(50);
  });

  it('logs a same-score re-score that moved the lead between SCORED and NEEDS_REVIEW', async () => {
    const caller = setup(
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT },
      { scoringStatus: 'NEEDS_REVIEW', scoredAt: SCORED_AT },
      scoreResult({ previousScore: 50, newScore: 50 })
    );

    await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

    expect(scoredRows()).toHaveLength(1);
  });

  it('logs a same-score re-score that qualified the lead', async () => {
    const caller = setup(
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT },
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT },
      scoreResult({ previousScore: 50, newScore: 50, autoQualified: true })
    );

    await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

    expect(scoredRows()).toHaveLength(1);
  });

  it("does not call a FAILED lead's next success a first score: it kept its earlier score", async () => {
    const caller = setup(
      { scoringStatus: 'FAILED', scoredAt: SCORED_AT },
      { scoringStatus: 'SCORED', scoredAt: SCORED_AT }
    );

    await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

    expect(scoredRows()[0]?.metadata).toMatchObject({ firstScore: false });
  });

  it('makes no first-score claim when the prior state cannot be read', async () => {
    const caller = setup('unreadable', { scoringStatus: 'SCORED', scoredAt: SCORED_AT });

    await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

    expect(scoredRows()).toHaveLength(1);
    expect(scoredRows()[0]?.metadata).not.toHaveProperty('firstScore');
  });
});
