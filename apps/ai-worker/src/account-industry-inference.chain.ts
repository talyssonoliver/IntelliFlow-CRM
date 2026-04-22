/**
 * IFC-312 — Account industry-inference chain.
 *
 * Classifies an account against the tenant's `AccountIndustryOption` vocabulary.
 * The output schema is dynamically narrowed with `z.enum(vocabulary.keys)` at
 * invoke time, so the LLM physically cannot emit an off-taxonomy value (any
 * such emission fails structured-output Zod validation). On success the chain
 * writes `Account.industry` + `industryInferredAt` + `industryModelVersion`.
 */

import { z } from 'zod';
import pino from 'pino';
import { prisma } from '@intelliflow/db';
import { createLLMForTenant } from './lib/llm-factory.js';
import { sanitizeStringField } from './utils/input-sanitizer.js';

const logger = pino({
  name: 'account-industry-inference.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const DEFAULT_MODEL_VERSION = 'account-industry-inference-v1';
const REVIEW_THRESHOLD = 0.5;

export interface IndustryVocabularyEntry {
  key: string;
  label: string;
}

export interface InferAccountIndustryInput {
  accountId: string;
  tenantId: string;
  seed: {
    name: string;
    website?: string;
    description?: string;
  };
  vocabulary: IndustryVocabularyEntry[];
}

export type InferAccountIndustryResult =
  | {
      success: true;
      industryKey: string;
      confidence: number;
      requiresReview: boolean;
      modelVersion: string;
    }
  | { success: false; reason: string };

export async function inferAccountIndustry(
  input: InferAccountIndustryInput
): Promise<InferAccountIndustryResult> {
  const { accountId, tenantId, seed, vocabulary } = input;

  if (!vocabulary || vocabulary.length === 0) {
    return { success: false, reason: 'empty-vocabulary' };
  }

  const keys = vocabulary.map((v) => v.key);
  // Build the per-invoke schema with a restricted enum so parse rejects
  // off-taxonomy labels.
  const OutputSchema = z.object({
    industryKey: z.enum(keys as [string, ...string[]]),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional(),
    modelVersion: z.string().optional(),
  });

  const sanitizedSeed = {
    name: sanitizeStringField(seed.name),
    ...(seed.website ? { website: sanitizeStringField(seed.website) } : {}),
    ...(seed.description ? { description: sanitizeStringField(seed.description) } : {}),
  };

  try {
    const model = await createLLMForTenant('structured', 'standard', { tenantId });
    const structured = model.withStructuredOutput(OutputSchema);
    const raw = await structured.invoke(
      [
        {
          role: 'system',
          content:
            'You classify a CRM account into one of the tenant\'s industry keys. ' +
            `Allowed keys: ${JSON.stringify(keys)}. ` +
            'Return industryKey (must be one of the allowed keys), confidence (0-1), reasoning.',
        },
        {
          role: 'user',
          content: `Account seed: ${JSON.stringify(sanitizedSeed)}. Classify it.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );

    const parsed = OutputSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ err: parsed.error, accountId, tenantId }, 'industry inference parse failed');
      return { success: false, reason: 'off-taxonomy-or-invalid' };
    }

    const { industryKey, confidence } = parsed.data;
    const modelVersion = parsed.data.modelVersion ?? DEFAULT_MODEL_VERSION;
    const now = new Date();

    try {
      await prisma.account.update({
        where: { tenantId_id: { tenantId, id: accountId } },
        data: {
          industry: industryKey,
          industryInferredAt: now,
          industryModelVersion: modelVersion,
        },
      });
    } catch (err) {
      logger.warn({ err, accountId, tenantId }, 'industry inference update failed');
      return { success: false, reason: 'db-update-error' };
    }

    return {
      success: true,
      industryKey,
      confidence,
      requiresReview: confidence < REVIEW_THRESHOLD,
      modelVersion,
    };
  } catch (err) {
    logger.warn({ err, accountId, tenantId }, 'industry-inference LLM call failed');
    return { success: false, reason: 'llm-error' };
  }
}
