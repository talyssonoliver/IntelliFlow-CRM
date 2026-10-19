/**
 * LLM Span Wrapper
 *
 * Wraps a LangChain BaseChatModel so that every `.invoke()` call is enclosed
 * in an OTel span named `llm.invoke`.
 *
 * Also wraps LangChain Embeddings so that `.embedQuery()` / `.embedDocuments()`
 * calls are enclosed in `llm.embed` spans.
 *
 * Attributes captured per ADR-048 Observability Contracts:
 * - llm.purpose  — LLMPurpose value (chat models only)
 * - llm.tier     — LLMTier value
 * - llm.provider — runtime aiConfig.provider
 * - llm.model_name — logical alias sent to LiteLLM
 * - tenant.id    — from tenantContextStore (AsyncLocalStorage) or 'unknown'
 *
 * PG-199: the wrappers are also the single metering site — every successful call is
 * recorded once (lib/usage-metering.ts), and embeddings check the rag ceiling first.
 */

import { trace, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import type { LLMPurpose, LLMTier } from '../lib/llm-factory.js';
import { aiConfig } from '../config/ai.config.js';
import { tenantContextStore } from './tenant-context.js';
import { GeminiEmbeddings } from '../lib/gemini-embeddings.js';
import {
  chatPricingKey,
  guardEmbeddingCall,
  recordEmbeddingUsage,
  recordModelUsage,
} from '../lib/usage-metering.js';

const tracer = trace.getTracer('intelliflow-ai-worker', '0.1.0');

export interface LLMTracingMeta {
  purpose: LLMPurpose;
  tier: LLMTier;
  /** PG-199: catalog model pinned by the tenant, when any. */
  modelId?: string;
  /** PG-199: pricing key of the model the provider actually runs, when it is not the alias. */
  pricingKey?: string;
}

export interface EmbeddingsTracingMeta {
  tier: LLMTier;
  /** PG-199: MODEL_PRICING key of the embeddings provider in use (default `rag-${tier}`). */
  pricingKey?: string;
}

/**
 * Return a proxy of `model` whose `.invoke()` method is wrapped in an OTel span.
 * The original model instance is mutated in-place so cached instances also gain
 * instrumentation.
 */
export function wrapModelWithTracing(model: BaseChatModel, meta: LLMTracingMeta): BaseChatModel {
  // Guard for test mocks that may not implement `.invoke` on the stubbed class.
  // Real BaseChatModel instances always have it; without this guard every mock
  // of @langchain/openai would need to implement .invoke to survive tracing wrap.
  if (typeof (model as { invoke?: unknown }).invoke !== 'function') {
    return model;
  }
  type InvokeParams = Parameters<typeof model.invoke>;
  const originalInvoke = model.invoke.bind(model) as (
    ...args: InvokeParams
  ) => ReturnType<typeof model.invoke>;

  (model as unknown as Record<string, unknown>)['invoke'] = async (
    input: InvokeParams[0],
    options?: InvokeParams[1]
  ) => {
    const tenantId = tenantContextStore.getStore()?.tenantId ?? 'unknown';

    return tracer.startActiveSpan(
      'llm.invoke',
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'llm.purpose': meta.purpose,
          'llm.tier': meta.tier,
          'llm.provider': aiConfig.provider,
          'llm.model_name':
            meta.modelId || meta.pricingKey ? chatPricingKey(meta) : `${meta.purpose}-${meta.tier}`,
          'tenant.id': tenantId,
        },
      },
      async (span: Span) => {
        try {
          const result = await originalInvoke(input, options);
          span.setStatus({ code: SpanStatusCode.OK });
          recordModelUsage(meta, input, result);
          return result;
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          span.recordException(err as Error);
          throw err;
        } finally {
          span.end();
        }
      }
    );
  };

  // PG-199: withStructuredOutput / bindTools go through withConfig, which returns a new
  // model built from the same fields (not this patched instance). Wrap those clones too,
  // or every structured call would skip the span and the metering. A binding that
  // delegates to this instance (e.g. RunnableBinding) is left alone: it is already metered.
  const withConfig = (model as { withConfig?: unknown }).withConfig;
  if (typeof withConfig === 'function') {
    const originalWithConfig = withConfig.bind(model) as (config: unknown) => BaseChatModel;
    (model as unknown as Record<string, unknown>)['withConfig'] = (config: unknown) => {
      const bound = originalWithConfig(config);
      const isClone = bound !== model && bound?.constructor === model.constructor;
      return isClone ? wrapModelWithTracing(bound, meta) : bound;
    };
  }

  return model;
}

/**
 * Meter each provider request instead of the whole call: `embedDocuments` fans out into
 * several requests (Promise.all), and when one fails the ones that succeeded were still
 * billed and must still count toward the rag ceiling. Returns false for a provider without a
 * known per-request method; the call wrappers then meter the whole successful call.
 */
function meterEmbeddingRequests(embeddings: Embeddings, meta: EmbeddingsTracingMeta): boolean {
  const asRecord = embeddings as unknown as Record<string, unknown>;
  let method: string;
  let textsOf: (arg: unknown) => string[];
  if (embeddings instanceof GeminiEmbeddings) {
    // One embedContent request per text.
    method = 'embed';
    textsOf = (text) => [String(text)];
  } else if (typeof asRecord['embeddingWithRetry'] === 'function') {
    // OpenAIEmbeddings (LiteLLM / OpenAI): one request per batch of `input`.
    method = 'embeddingWithRetry';
    textsOf = (request) => {
      const input = (request as { input?: unknown } | undefined)?.input;
      return Array.isArray(input) ? input.map(String) : [String(input ?? '')];
    };
  } else {
    return false;
  }
  const original = (
    asRecord[method] as (arg: unknown, ...rest: unknown[]) => Promise<unknown>
  ).bind(embeddings);
  asRecord[method] = async (arg: unknown, ...rest: unknown[]): Promise<unknown> => {
    const result = await original(arg, ...rest);
    recordEmbeddingUsage(tenantContextStore.getStore()?.tenantId, meta, textsOf(arg));
    return result;
  };
  return true;
}

/**
 * Return a proxy of `embeddings` whose `.embedQuery()` and `.embedDocuments()`
 * methods are each wrapped in an OTel span named `llm.embed`.
 *
 * The original instance is mutated in-place so cached instances also gain
 * instrumentation — consistent with `wrapModelWithTracing`.
 *
 * Attributes per ADR-048:
 * - llm.tier        — EmbeddingsTracingMeta.tier
 * - llm.provider    — runtime aiConfig.provider
 * - llm.model_name  — `rag-${tier}` (the LiteLLM alias for embeddings)
 * - tenant.id       — from tenantContextStore or 'unknown'
 */
export function wrapEmbeddingsWithTracing(
  embeddings: Embeddings,
  meta: EmbeddingsTracingMeta
): Embeddings {
  // Guard for test mocks or minimal stubs that don't implement the embeddings
  // interface. Skip wrapping rather than throwing at instrumentation time.
  const asRecord = embeddings as unknown as Record<string, unknown>;
  const metersRequests = meterEmbeddingRequests(embeddings, meta);
  const recordCall = (tenantId: string | undefined, texts: string[]): void => {
    if (!metersRequests) recordEmbeddingUsage(tenantId, meta, texts);
  };

  if (typeof asRecord['embedQuery'] === 'function') {
    const originalEmbedQuery = (asRecord['embedQuery'] as (text: string) => Promise<number[]>).bind(
      embeddings
    );

    asRecord['embedQuery'] = async (text: string): Promise<number[]> => {
      const jobTenantId = tenantContextStore.getStore()?.tenantId;
      const tenantId = jobTenantId ?? 'unknown';
      await guardEmbeddingCall(jobTenantId, meta.tier);

      return tracer.startActiveSpan(
        'llm.embed',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'llm.tier': meta.tier,
            'llm.provider': aiConfig.provider,
            'llm.model_name': `rag-${meta.tier}`,
            'tenant.id': tenantId,
          },
        },
        async (span: Span) => {
          try {
            const result = await originalEmbedQuery(text);
            span.setStatus({ code: SpanStatusCode.OK });
            recordCall(jobTenantId, [text]);
            return result;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            span.recordException(err as Error);
            throw err;
          } finally {
            span.end();
          }
        }
      );
    };
  }

  if (typeof asRecord['embedDocuments'] === 'function') {
    const originalEmbedDocuments = (
      asRecord['embedDocuments'] as (texts: string[]) => Promise<number[][]>
    ).bind(embeddings);

    asRecord['embedDocuments'] = async (texts: string[]): Promise<number[][]> => {
      const jobTenantId = tenantContextStore.getStore()?.tenantId;
      const tenantId = jobTenantId ?? 'unknown';
      await guardEmbeddingCall(jobTenantId, meta.tier);

      return tracer.startActiveSpan(
        'llm.embed',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'llm.tier': meta.tier,
            'llm.provider': aiConfig.provider,
            'llm.model_name': `rag-${meta.tier}`,
            'tenant.id': tenantId,
          },
        },
        async (span: Span) => {
          try {
            const result = await originalEmbedDocuments(texts);
            span.setStatus({ code: SpanStatusCode.OK });
            recordCall(jobTenantId, texts);
            return result;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            span.recordException(err as Error);
            throw err;
          } finally {
            span.end();
          }
        }
      );
    };
  }

  return embeddings;
}
