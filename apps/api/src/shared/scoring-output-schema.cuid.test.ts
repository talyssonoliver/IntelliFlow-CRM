/**
 * #1074: scoring request, response and override schemas carry real lead and user
 * ids, which are cuids (`@default(cuid())`), so they must accept them.
 */

import { describe, it, expect } from 'vitest';

import {
  scoringResponseSchema,
  batchScoringRequestSchema,
  scoreOverrideSchema,
} from './scoring-output-schema.zod';

// The shape Prisma's @default(cuid()) issues: 'c' plus 24 lower-case base36 chars.
const CUID = 'cmhbx3k2p0000l8086a1b2c3d';
const CUID_2 = 'cmhbx3k2p0001l8086e4f5g6h';

describe('scoring schemas accept cuid ids (#1074)', () => {
  it('scoringResponseSchema accepts a cuid leadId', () => {
    expect(
      scoringResponseSchema.safeParse({
        leadId: CUID,
        scoring: { score: 70, confidence: 0.8, factors: [], modelVersion: 'v1' },
        tier: 'WARM',
        scoredAt: '2026-10-29T18:00:02.000Z',
        latencyMs: 1,
      }).success
    ).toBe(true);
  });

  it('batchScoringRequestSchema accepts cuid leadIds', () => {
    expect(batchScoringRequestSchema.safeParse({ leadIds: [CUID, CUID_2] }).success).toBe(true);
  });

  it('scoreOverrideSchema accepts a cuid lead and overriding user', () => {
    expect(
      scoreOverrideSchema.safeParse({
        leadId: CUID,
        overrideScore: 50,
        reason: 'Customer confirmed budget on call',
        overriddenBy: CUID_2,
      }).success
    ).toBe(true);
  });

  it.each(['', '../x', 'c abc', 'c'.repeat(65)])('rejects the unsafe lead id %j', (id) => {
    expect(batchScoringRequestSchema.safeParse({ leadIds: [id] }).success).toBe(false);
  });
});
