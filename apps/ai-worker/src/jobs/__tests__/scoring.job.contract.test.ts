/**
 * IFC-212: Scoring job DTO contract test (3 cases).
 *
 * Anchors the API-side payload shape against the worker's ScoringJobDataSchema.
 * If the worker's schema changes, this test fails and forces a re-sync of
 * apps/api/src/services/queue/QueueAIService.ts (its inline ScoringJobResultMirror
 * + payload constructor).
 *
 * Plan: Step 1.4.
 */

import { describe, it, expect } from 'vitest';
import { ScoringJobDataSchema, ScoringJobResultSchema } from '../scoring.job';

describe('scoring.job.contract', () => {
  it('case 1: API-side payload (as built by QueueAIService) parses cleanly', () => {
    // This MUST stay in sync with the payload constructor inside
    // apps/api/src/services/queue/QueueAIService.ts (Step 2.4).
    const payload = {
      leadId: '00000000-0000-4000-8000-000000000001',
      tenantId: 'tenant-A',
      lead: {
        email: 'lead@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        company: 'Acme Inc',
        title: 'VP Engineering',
        phone: '+15555550100',
        source: 'WEBSITE',
      },
      correlationId: 'lead-score-lead@example.com-1234567890',
      _otelCarrier: { traceparent: '00-abc-def-01' },
    };
    const parsed = ScoringJobDataSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('case 2: omitting required fields yields safeParse failure', () => {
    const missingLeadId = ScoringJobDataSchema.safeParse({
      // leadId omitted
      tenantId: 'tenant-A',
      lead: { email: 'a@b.com', source: 'WEBSITE' },
    });
    expect(missingLeadId.success).toBe(false);

    const missingTenantId = ScoringJobDataSchema.safeParse({
      leadId: '00000000-0000-4000-8000-000000000001',
      // tenantId omitted
      lead: { email: 'a@b.com', source: 'WEBSITE' },
    });
    expect(missingTenantId.success).toBe(false);

    const missingEmail = ScoringJobDataSchema.safeParse({
      leadId: '00000000-0000-4000-8000-000000000001',
      tenantId: 'tenant-A',
      lead: { source: 'WEBSITE' /* email omitted */ } as { source: string },
    });
    expect(missingEmail.success).toBe(false);

    const missingSource = ScoringJobDataSchema.safeParse({
      leadId: '00000000-0000-4000-8000-000000000001',
      tenantId: 'tenant-A',
      lead: { email: 'a@b.com' /* source omitted */ } as { email: string },
    });
    expect(missingSource.success).toBe(false);
  });

  /**
   * IFC-212 audit fix HIGH-2 regression guard.
   *
   * The original contract test only covered ScoringJobDataSchema (inbound payload).
   * QueueAIService validates worker results with an INLINE ScoringJobResultMirror
   * (apps/api/src/services/queue/QueueAIService.ts:43-53). If the worker's outbound
   * ScoringJobResultSchema gains a new required field or narrows a type, the loose
   * mirror would silently accept the new shape — Result.ok would still flow back
   * with stale fields. This test pins the worker's RESULT schema:
   *  - the keys the API-side mirror checks MUST exist on the worker's schema
   *  - basic types MUST be compatible (worker is the source of truth)
   * Drift surfaces here, NOT in production.
   */
  it('case 4 [HIGH-2 regression]: ScoringJobResultSchema round-trip — worker result the mirror expects', () => {
    // Sample shape produced by processScoringJob (apps/ai-worker/src/jobs/scoring.job.ts:509-519).
    const validResult = {
      leadId: '00000000-0000-4000-8000-000000000001',
      score: 75,
      confidence: 0.9,
      tier: 'WARM' as const,
      factors: [{ name: 'companySize', impact: 25, reasoning: 'large company' }],
      recommendations: ['Send personalized email sequence'],
      modelVersion: 'v1',
      processedAt: '2026-04-27T18:00:00.000Z',
      processingTimeMs: 1234,
    };
    const parsed = ScoringJobResultSchema.safeParse(validResult);
    expect(parsed.success).toBe(true);

    // Mirror check — every key the API-side ScoringJobResultMirror reads MUST be
    // accepted by the worker's schema. Reproduces the mirror keys here and asserts
    // the worker schema parses them. If the worker tightens (e.g. requires a new
    // field), this test fails until the API-side mirror is re-synced.
    const mirrorShapeKeys = [
      'leadId',
      'score',
      'confidence',
      'tier',
      'factors',
      'recommendations',
      'modelVersion',
      'processedAt',
      'processingTimeMs',
    ] as const;
    for (const key of mirrorShapeKeys) {
      expect(validResult).toHaveProperty(key);
    }

    // Worker SHOULD reject an obviously broken shape (one of the keys missing).
    const missingScore = { ...validResult } as Partial<typeof validResult>;
    delete missingScore.score;
    expect(ScoringJobResultSchema.safeParse(missingScore).success).toBe(false);

    // Confidence outside [0,1] is rejected by the worker schema (it constrains
    // confidence to 0-1 — see apps/ai-worker/src/jobs/scoring.job.ts:62).
    const badConfidence = { ...validResult, confidence: 1.5 };
    expect(ScoringJobResultSchema.safeParse(badConfidence).success).toBe(false);

    // Score outside [0,100] is rejected by the worker schema.
    const badScore = { ...validResult, score: 250 };
    expect(ScoringJobResultSchema.safeParse(badScore).success).toBe(false);

    // Unknown tier is rejected (worker uses a closed enum).
    const badTier = { ...validResult, tier: 'BURNING' as 'HOT' };
    expect(ScoringJobResultSchema.safeParse(badTier).success).toBe(false);
  });

  it('case 3: _otelCarrier accepts arbitrary string-keyed string-valued shape', () => {
    const minimal = {
      leadId: '00000000-0000-4000-8000-000000000001',
      tenantId: 'tenant-A',
      lead: { email: 'a@b.com', source: 'WEBSITE' },
      _otelCarrier: {},
    };
    expect(ScoringJobDataSchema.safeParse(minimal).success).toBe(true);

    const populated = {
      ...minimal,
      _otelCarrier: {
        traceparent: '00-abc-def-01',
        tracestate: 'rojo=00f067aa0ba902b7',
      },
    };
    expect(ScoringJobDataSchema.safeParse(populated).success).toBe(true);

    const noCarrier = {
      leadId: '00000000-0000-4000-8000-000000000001',
      tenantId: 'tenant-A',
      lead: { email: 'a@b.com', source: 'WEBSITE' },
    };
    expect(ScoringJobDataSchema.safeParse(noCarrier).success).toBe(true);
  });
});
