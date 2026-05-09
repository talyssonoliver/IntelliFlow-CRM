/**
 * IFC-312 — Account scoring chain.
 *
 * LLM-produced fit/engagement score for an account based on CRM signals.
 * Writes `Account.score`, `scoreProvenance` (factors[]), `scoredAt`, and
 * `scoreModelVersion`. Always succeeds to the caller; LLM errors produce a
 * zero-score fallback with `source: 'fallback'`.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'account-scoring.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const FactorSchema = z.object({
  name: z.string(),
  impact: z.number(),
  reasoning: z.string(),
});

const ScoreLLMSchema = z.object({
  score: z.number(),
  confidence: z.number().min(0).max(1),
  factors: z.array(FactorSchema),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'account-scoring-v1';
const REVIEW_THRESHOLD = 0.5;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

export interface AccountScoringSignals {
  contactCount: number;
  openDealCount: number;
  totalRevenue: number;
  recentActivityDays?: number;
  healthScore?: number;
}

export interface ScoreAccountInput {
  accountId: string;
  tenantId: string;
  signals: AccountScoringSignals;
}

export type ScoreAccountResult =
  | {
      success: true;
      score: number;
      confidence: number;
      requiresReview: boolean;
      modelVersion: string;
      source: 'llm' | 'fallback';
      factors: Array<{ name: string; impact: number; reasoning: string }>;
    }
  | { success: false; reason: string };

export async function scoreAccount(input: ScoreAccountInput): Promise<ScoreAccountResult> {
  const { accountId, tenantId, signals } = input;

  let parsed: z.infer<typeof ScoreLLMSchema> | null = null;
  let source: 'llm' | 'fallback' = 'llm';

  try {
    const model = await createLLMForTenant('scoring', 'standard', { tenantId });
    const structured = model.withStructuredOutput(ScoreLLMSchema);
    const raw = await structured.invoke([
      {
        role: 'system',
        content:
          'You produce a fit + engagement score for a CRM account. Return: ' +
          'score (0-100), confidence (0-1), factors[] with {name, impact (-50..+50), reasoning}.',
      },
      {
        role: 'user',
        content: `Signals: ${JSON.stringify(signals)}. Score the account.`,
      },
    ] as unknown as Parameters<typeof structured.invoke>[0]);
    const safe = ScoreLLMSchema.safeParse(raw);
    if (safe.success) parsed = safe.data;
    else source = 'fallback';
  } catch (err) {
    logger.warn({ err, accountId, tenantId }, 'scoring LLM call failed');
    source = 'fallback';
  }

  const payload =
    parsed && source === 'llm'
      ? {
          score: clamp(parsed.score, 0, 100),
          confidence: Math.min(1, Math.max(0, parsed.confidence)),
          factors: parsed.factors,
          modelVersion: parsed.modelVersion ?? DEFAULT_MODEL_VERSION,
          source: 'llm' as const,
        }
      : {
          score: 0,
          confidence: 0,
          factors: [
            {
              name: 'fallback',
              impact: 0,
              reasoning: 'LLM unavailable — zero-score fallback emitted.',
            },
          ],
          modelVersion: DEFAULT_MODEL_VERSION,
          source: 'fallback' as const,
        };

  const now = new Date();
  try {
    await prisma.account.update({
      where: { tenantId_id: { tenantId, id: accountId } },
      data: {
        score: payload.score,
        scoreProvenance: payload.factors as unknown as any,
        scoredAt: now,
        scoreModelVersion: payload.modelVersion,
      },
    });
  } catch (err) {
    logger.warn({ err, accountId, tenantId }, 'scoring update failed');
    return { success: false, reason: 'db-update-error' };
  }

  return {
    success: true,
    score: payload.score,
    confidence: payload.confidence,
    requiresReview: payload.confidence < REVIEW_THRESHOLD,
    modelVersion: payload.modelVersion,
    source: payload.source,
    factors: payload.factors,
  };
}
