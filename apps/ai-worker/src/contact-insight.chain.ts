/**
 * IFC-312 — Contact insight chain.
 *
 * LLM generates a structured summary (conversion probability, LTV, churn risk,
 * next-best-action, sentiment, engagement, recommendations) and upserts
 * `ContactAIInsight` with provenance fields. Always succeeds to the caller:
 * LLM errors produce a fallback insight with `source='fallback'`.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';

const logger = pino({
  name: 'contact-insight.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const ChurnRiskSchema = z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const SentimentSchema = z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional();

const InsightLLMSchema = z.object({
  conversionProbability: z.number().min(0).max(100),
  lifetimeValue: z.number().int().min(0),
  churnRisk: ChurnRiskSchema,
  nextBestAction: z.string().optional(),
  sentiment: SentimentSchema,
  engagementScore: z.number().min(0).max(100),
  recommendations: z.array(z.string()).optional(),
  sentimentTrend: z.string().optional(),
  lastEngagementDays: z.number().int().min(0).optional(),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'contact-insight-v1';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface ContactInsightContext {
  activities?: Array<{ type: string; at: string; summary?: string }>;
  emails?: Array<{ from: string; subject?: string; bodyPreview?: string; at: string }>;
  deals?: Array<{ stage: string; value?: number }>;
}

export interface GenerateContactInsightInput {
  contactId: string;
  tenantId: string;
  context: ContactInsightContext;
}

export type GenerateContactInsightResult =
  | { success: true; source: 'llm' | 'fallback'; modelVersion: string }
  | { success: false; reason: string };

function buildFallback(tenantId: string, contactId: string) {
  return {
    conversionProbability: 0,
    lifetimeValue: 0,
    churnRisk: 'LOW' as const,
    nextBestAction: null,
    sentiment: null,
    engagementScore: 0,
    recommendations: [],
    sentimentTrend: null,
    lastEngagementDays: 0,
    modelVersion: DEFAULT_MODEL_VERSION,
    source: 'fallback' as const,
    _tenantId: tenantId,
    _contactId: contactId,
  };
}

export async function generateContactInsight(
  input: GenerateContactInsightInput
): Promise<GenerateContactInsightResult> {
  const { contactId, tenantId, context } = input;

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
            'You analyze a CRM contact and produce a 360 insight summary. ' +
            'Return: conversionProbability (0-100), lifetimeValue (USD cents, integer), ' +
            'churnRisk (MINIMAL|LOW|MEDIUM|HIGH|CRITICAL), nextBestAction, sentiment, ' +
            'engagementScore (0-100), recommendations[].',
        },
        {
          role: 'user',
          content: `Contact context: ${JSON.stringify(context)}. Generate insight.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );
    const safe = InsightLLMSchema.safeParse(raw);
    if (safe.success) {
      parsed = safe.data;
    } else {
      logger.warn({ err: safe.error }, 'insight output failed Zod validation');
      source = 'fallback';
    }
  } catch (err) {
    logger.warn({ err, contactId, tenantId }, 'insight LLM call failed');
    source = 'fallback';
  }

  const payload = parsed
    ? {
        conversionProbability: clamp(parsed.conversionProbability, 0, 100),
        lifetimeValue: Math.max(0, parsed.lifetimeValue),
        churnRisk: parsed.churnRisk,
        nextBestAction: parsed.nextBestAction ?? null,
        sentiment: parsed.sentiment ?? null,
        engagementScore: clamp(parsed.engagementScore, 0, 100),
        recommendations: parsed.recommendations ?? [],
        sentimentTrend: parsed.sentimentTrend ?? null,
        lastEngagementDays: parsed.lastEngagementDays ?? 0,
        modelVersion: parsed.modelVersion ?? DEFAULT_MODEL_VERSION,
        source,
      }
    : (() => {
        const fb = buildFallback(tenantId, contactId);
        return {
          conversionProbability: fb.conversionProbability,
          lifetimeValue: fb.lifetimeValue,
          churnRisk: fb.churnRisk,
          nextBestAction: fb.nextBestAction,
          sentiment: fb.sentiment,
          engagementScore: fb.engagementScore,
          recommendations: fb.recommendations,
          sentimentTrend: fb.sentimentTrend,
          lastEngagementDays: fb.lastEngagementDays,
          modelVersion: fb.modelVersion,
          source: 'fallback' as const,
        };
      })();

  const now = new Date();
  try {
    await prisma.contactAIInsight.upsert({
      where: { contactId },
      create: {
        ...payload,
        tenantId,
        contactId,
        generatedAt: now,
      } as any,
      update: {
        ...payload,
        tenantId,
        generatedAt: now,
      } as any,
    });
  } catch (err) {
    logger.warn({ err, contactId, tenantId }, 'Prisma upsert failed');
    return { success: false, reason: 'db-upsert-error' };
  }

  return { success: true, source: payload.source, modelVersion: payload.modelVersion };
}
