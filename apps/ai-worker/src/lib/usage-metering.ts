/**
 * usage-metering.ts — the single place AI usage is metered (PG-199, ADR-082).
 *
 * The tracing wrappers (`wrapModelWithTracing`, `wrapEmbeddingsWithTracing`) call these
 * helpers after every successful chat / embedding call, so each call is recorded exactly
 * once through `costTracker.recordUsage` with its AI purpose and pinned model. The
 * cost listener (ai-worker.ts) turns that into the tenant-wide and per-purpose spend.
 *
 * - Token counts come from the provider (`usage_metadata`) when it returns them, else
 *   they are estimated from the text; embeddings return no usage, so their spend is
 *   always an estimate from the input text.
 * - Price: the pinned catalog model's pricing key, else the `${purpose}-${tier}` alias.
 * - Embeddings are metered (and their rag ceiling checked) only inside a tenant job
 *   context; the shared boot-time embedding chain has no tenant to bill.
 */

import { getCatalogEntry, type LLMPurpose, type LLMTier } from '@intelliflow/domain';
import { aiConfig } from '../config/ai.config.js';
import { costTracker } from '../utils/cost-tracker';
import { countTokens } from '../utils/token-counter.js';
import { assertWithinCeiling } from './purpose-ceiling.js';
import { resolveEffectiveTier } from './tenant-ai-config.js';

export interface ModelUsageMeta {
  purpose: LLMPurpose;
  tier: LLMTier;
  /** Catalog id when the tenant pinned a model. */
  modelId?: string;
}

export interface EmbeddingUsageMeta {
  tier: LLMTier;
  /** MODEL_PRICING key of the embeddings provider in use (default `rag-${tier}`). */
  pricingKey?: string;
}

/** The MODEL_PRICING key a chat call is priced with. */
export function chatPricingKey(meta: ModelUsageMeta): string {
  const pinned = meta.modelId ? getCatalogEntry(meta.modelId) : undefined;
  return pinned?.pricingKey ?? `${meta.purpose}-${meta.tier}`;
}

function costTrackingEnabled(): boolean {
  return aiConfig.costTracking?.enabled === true;
}

function isBillableTenant(tenantId: string | undefined): tenantId is string {
  return !!tenantId && tenantId !== 'unknown' && !tenantId.startsWith('__');
}

/** Flatten a prompt / message list / model output into text for token estimation. */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (typeof value === 'object') {
    const record = value as { content?: unknown; text?: unknown; value?: unknown };
    if (record.content !== undefined) return textOf(record.content);
    if (record.text !== undefined) return textOf(record.text);
    if (typeof (value as { toString?: unknown }).toString === 'function') {
      const s = String(value);
      if (s !== '[object Object]') return s;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** Record one successful chat call. */
export function recordModelUsage(meta: ModelUsageMeta, input: unknown, result: unknown): void {
  if (!costTrackingEnabled()) return;
  const usage = (result as { usage_metadata?: { input_tokens?: number; output_tokens?: number } })
    ?.usage_metadata;
  const model = chatPricingKey(meta);
  costTracker.recordUsage({
    model,
    inputTokens: usage?.input_tokens ?? countTokens(textOf(input), model),
    outputTokens: usage?.output_tokens ?? countTokens(textOf(result), model),
    operationType: `llm:${meta.purpose}`,
    metadata: { purpose: meta.purpose, tier: meta.tier, modelId: meta.modelId ?? null },
  });
}

/** Block an embedding call when the tenant's rag purpose has reached its monthly ceiling. */
export async function guardEmbeddingCall(
  tenantId: string | undefined,
  tier: LLMTier
): Promise<void> {
  if (!isBillableTenant(tenantId)) return;
  const config = await resolveEffectiveTier(tenantId, 'rag', tier);
  await assertWithinCeiling(tenantId, 'rag', config.ceilingCents);
}

/** Record one successful embedding call (estimated from the embedded text). */
export function recordEmbeddingUsage(
  tenantId: string | undefined,
  meta: EmbeddingUsageMeta,
  texts: readonly string[]
): void {
  if (!isBillableTenant(tenantId) || !costTrackingEnabled()) return;
  const model = meta.pricingKey ?? `rag-${meta.tier}`;
  costTracker.recordUsage({
    model,
    inputTokens: texts.reduce((sum, text) => sum + countTokens(text, model), 0),
    outputTokens: 0,
    operationType: 'llm:rag',
    metadata: { purpose: 'rag', tier: meta.tier },
  });
}
