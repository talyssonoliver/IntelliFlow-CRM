/**
 * IFC-312 — Account insight chain.
 * Mirrors `contact-insight.chain.ts` for accounts, writing to `AccountAIInsight`.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'account-insight.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const ChurnRiskSchema = z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const InsightLLMSchema = z.object({
  healthSummary: z.string().optional(),
  nextBestAction: z.string().optional(),
  keySignals: z
    .array(
      z.object({
        label: z.string(),
        impact: z.enum(['positive', 'negative', 'neutral']).optional(),
        weight: z.number().min(0).max(1).optional(),
      })
    )
    .optional(),
  churnRisk: ChurnRiskSchema,
  engagementScore: z.number().min(0).max(100),
  sentimentTrend: z.string().optional(),
  recommendations: z.array(z.string()).optional(),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'account-insight-v1';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface AccountInsightContext {
  activities?: Array<{ type: string; at: string; summary?: string }>;
  opportunities?: Array<{ stage: string; value?: number }>;
  healthSnapshot?: { overallScore?: number; churnRisk?: string };
}

export interface GenerateAccountInsightInput {
  accountId: string;
  tenantId: string;
  context: AccountInsightContext;
}

export type GenerateAccountInsightResult =
  | { success: true; source: 'llm' | 'fallback'; modelVersion: string }
  | { success: false; reason: string };

function buildFallback() {
  return {
    healthSummary: null,
    nextBestAction: null,
    keySignals: null,
    churnRisk: 'LOW' as const,
    engagementScore: 0,
    sentimentTrend: null,
    recommendations: [],
    modelVersion: DEFAULT_MODEL_VERSION,
    source: 'fallback' as const,
  };
}

export async function generateAccountInsight(
  input: GenerateAccountInsightInput
): Promise<GenerateAccountInsightResult> {
  const { accountId, tenantId, context } = input;

  let parsed: z.infer<typeof InsightLLMSchema> | null = null;
  let source: 'llm' | 'fallback' = 'llm';

  try {
    const model = await createLLMForTenant('qualification', 'standard', { tenantId });
    const structured = model.withStructuredOutput(InsightLLMSchema);
    const raw = await structured.invoke(
      [
        {
          role: 'system',
          content:
            'You analyze a CRM account and produce a health summary. ' +
            'Return: healthSummary (free text), nextBestAction, keySignals[] ' +
            '(with label + impact: positive|negative|neutral + weight 0-1), ' +
            'churnRisk (MINIMAL|LOW|MEDIUM|HIGH|CRITICAL), engagementScore (0-100), ' +
            'sentimentTrend, recommendations[].',
        },
        {
          role: 'user',
          content: `Account context: ${JSON.stringify(context)}. Produce insight JSON.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );
    const safe = InsightLLMSchema.safeParse(raw);
    if (safe.success) parsed = safe.data;
    else source = 'fallback';
  } catch (err) {
    logger.warn({ err, accountId, tenantId }, 'account insight LLM call failed');
    source = 'fallback';
  }

  const payload = parsed
    ? {
        healthSummary: parsed.healthSummary ?? null,
        nextBestAction: parsed.nextBestAction ?? null,
        keySignals: parsed.keySignals ?? null,
        churnRisk: parsed.churnRisk,
        engagementScore: clamp(parsed.engagementScore, 0, 100),
        sentimentTrend: parsed.sentimentTrend ?? null,
        recommendations: parsed.recommendations ?? [],
        modelVersion: parsed.modelVersion ?? DEFAULT_MODEL_VERSION,
        source,
      }
    : buildFallback();

  const now = new Date();
  try {
    await prisma.accountAIInsight.upsert({
      where: { accountId },
      create: {
        ...payload,
        tenantId,
        accountId,
        generatedAt: now,
      } as any,
      update: {
        ...payload,
        tenantId,
        generatedAt: now,
      } as any,
    });
  } catch (err) {
    logger.warn({ err, accountId, tenantId }, 'Prisma upsert failed');
    return { success: false, reason: 'db-upsert-error' };
  }

  return { success: true, source: payload.source, modelVersion: payload.modelVersion };
}
