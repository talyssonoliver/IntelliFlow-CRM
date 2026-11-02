/**
 * #1074: the AI scoring queue payloads carry real record ids, which are cuids
 * (`@default(cuid())`), so the queue schemas must accept them.
 */

import { describe, it, expect } from 'vitest';

import { aiScoringJobDataSchema, aiScoringResultSchema } from './types';

// The shape Prisma's @default(cuid()) issues: 'c' plus 24 lower-case base36 chars.
const CUID = 'cmhbx3k2p0000l8086a1b2c3d';
const CUID_2 = 'cmhbx3k2p0001l8086e4f5g6h';

describe('AI scoring queue schemas accept cuid ids (#1074)', () => {
  it('accepts a scoring job for a cuid lead and user', () => {
    expect(aiScoringJobDataSchema.safeParse({ leadId: CUID, userId: CUID_2 }).success).toBe(true);
  });

  it('accepts a scoring result for a cuid lead', () => {
    expect(
      aiScoringResultSchema.safeParse({
        leadId: CUID,
        score: 70,
        confidence: 0.8,
        factors: {},
        modelVersion: 'v1',
        processingTimeMs: 1,
        scoredAt: '2026-10-29T18:00:02.000Z',
      }).success
    ).toBe(true);
  });

  it.each(['', '../x', 'c abc', 'c'.repeat(65)])('rejects the unsafe id %j', (id) => {
    expect(aiScoringJobDataSchema.safeParse({ leadId: id, userId: CUID_2 }).success).toBe(false);
  });
});
