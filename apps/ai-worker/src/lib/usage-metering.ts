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
import { aiConfig, servedPricingKey } from '../config/ai.config.js';
import { costTracker } from '../utils/cost-tracker';
import { countTokens } from '../utils/token-counter.js';
import { assertWithinCeiling } from './purpose-ceiling.js';
import { resolveEffectiveTier } from './tenant-ai-config.js';

export interface ModelUsageMeta {
  purpose: LLMPurpose;
  tier: LLMTier;
  /** Catalog id when the tenant pinned a model. */
  modelId?: string;
  /** MODEL_PRICING key of the model the provider actually runs, when it is not the alias. */
  pricingKey?: string;
}

export interface EmbeddingUsageMeta {
  tier: LLMTier;
  /** MODEL_PRICING key of the embeddings provider in use (default `rag-${tier}`). */
  pricingKey?: string;
}

/** The MODEL_PRICING key a chat call is priced with. */
export function chatPricingKey(meta: ModelUsageMeta): string {
  if (meta.pricingKey) return meta.pricingKey;
  const pinned = meta.modelId ? getCatalogEntry(meta.modelId) : undefined;
  return pinned?.pricingKey ?? `${meta.purpose}-${meta.tier}`;
}

/**
 * Metering runs after a successful (possibly paid) call: a metering failure, such as the
 * daily cost limit check throwing, is logged and never turns that answer into an error.
 */
function recordSafely(record: () => void): void {
  try {
    record();
  } catch (error) {
    console.warn(
      `[usage-metering] usage_not_metered: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function costTrackingEnabled(): boolean {
  return aiConfig.costTracking?.enabled === true;
}

function isBillableTenant(tenantId: string | undefined): tenantId is string {
  return !!tenantId && tenantId !== 'unknown' && !tenantId.startsWith('__');
}

interface ToolCallingMessage {
  tool_calls?: Array<{ name?: string; args?: unknown }>;
  additional_kwargs?: {
    tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    function_call?: { name?: string; arguments?: string };
  };
}

/**
 * The tool calls a message generated, as text. Uses the normalized `tool_calls` when present,
 * else the legacy provider representation, so the same call is never counted twice.
 */
function toolCallText(message: ToolCallingMessage): string {
  if (message.tool_calls?.length) {
    return message.tool_calls
      .map((c) => `${c.name ?? ''} ${JSON.stringify(c.args ?? {})}`)
      .join('\n');
  }
  const legacy = message.additional_kwargs;
  const calls = legacy?.tool_calls?.map((c) => c.function) ?? [legacy?.function_call];
  return calls
    .filter((c) => c !== undefined)
    .map((c) => `${c.name ?? ''} ${c.arguments ?? ''}`)
    .join('\n');
}

/** Flatten a prompt / message list / model output into text for token estimation. */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => textOf(item)).join('\n');
  if (typeof value === 'object') return objectText(value);
  return String(value);
}

function objectText(value: object): string {
  const record = value as { content?: unknown; text?: unknown };
  if (record.content !== undefined) {
    // A message: its content plus any tool calls it generated (a tool call has empty content).
    return [textOf(record.content), toolCallText(value as ToolCallingMessage)]
      .filter(Boolean)
      .join('\n');
  }
  if (record.text !== undefined) return textOf(record.text);
  if (typeof (value as { toString?: unknown }).toString === 'function') {
    const s = String(value);
    if (s !== '[object Object]') return s;
  }
  return JSON.stringify(value);
}

/**
 * Refuse a metered call before it reaches the provider once the daily cost limit is reached.
 * recordSafely never fails the paid call that crosses the limit, so the limit holds here.
 */
export function assertWithinDailyLimit(): void {
  if (costTrackingEnabled()) costTracker.assertWithinDailyLimit();
}

/** Record one successful chat call. */
export function recordModelUsage(meta: ModelUsageMeta, input: unknown, result: unknown): void {
  if (!costTrackingEnabled()) return;
  const message = result as {
    usage_metadata?: { input_tokens?: number; output_tokens?: number };
    response_metadata?: { model_name?: string };
  };
  const usage = message?.usage_metadata;
  // The gateway may serve another (e.g. a paid fallback) model than the one asked for:
  // price what ran when the response names a known deployment (owner Q9).
  const model = servedPricingKey(message?.response_metadata?.model_name) ?? chatPricingKey(meta);
  recordSafely(() =>
    costTracker.recordUsage({
      model,
      inputTokens: usage?.input_tokens ?? countTokens(textOf(input), model),
      outputTokens: usage?.output_tokens ?? countTokens(textOf(result), model),
      operationType: `llm:${meta.purpose}`,
      metadata: { purpose: meta.purpose, tier: meta.tier, modelId: meta.modelId ?? null },
    })
  );
}

/** Block an embedding call when the tenant's rag purpose has reached its monthly ceiling. */
export async function guardEmbeddingCall(
  tenantId: string | undefined,
  tier: LLMTier
): Promise<void> {
  if (!isBillableTenant(tenantId)) return;
  assertWithinDailyLimit();
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
  recordSafely(() =>
    costTracker.recordUsage({
      model,
      inputTokens: texts.reduce((sum, text) => sum + countTokens(text, model), 0),
      outputTokens: 0,
      operationType: 'llm:rag',
      metadata: { purpose: 'rag', tier: meta.tier },
    })
  );
}
