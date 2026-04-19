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
 */

import { trace, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import type { LLMPurpose, LLMTier } from '../lib/llm-factory.js';
import { aiConfig } from '../config/ai.config.js';
import { tenantContextStore } from './tenant-context.js';

const tracer = trace.getTracer('intelliflow-ai-worker', '0.1.0');

export interface LLMTracingMeta {
  purpose: LLMPurpose;
  tier: LLMTier;
}

export interface EmbeddingsTracingMeta {
  tier: LLMTier;
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
          'llm.model_name': `${meta.purpose}-${meta.tier}`,
          'tenant.id': tenantId,
        },
      },
      async (span: Span) => {
        try {
          const result = await originalInvoke(input, options);
          span.setStatus({ code: SpanStatusCode.OK });
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

  return model;
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

  if (typeof asRecord['embedQuery'] === 'function') {
    const originalEmbedQuery = (asRecord['embedQuery'] as (text: string) => Promise<number[]>).bind(
      embeddings
    );

    asRecord['embedQuery'] = async (text: string): Promise<number[]> => {
      const tenantId = tenantContextStore.getStore()?.tenantId ?? 'unknown';

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
      const tenantId = tenantContextStore.getStore()?.tenantId ?? 'unknown';

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
