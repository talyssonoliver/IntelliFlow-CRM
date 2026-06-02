import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import { aiConfig } from '../config/ai.config.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { resolveEffectiveTier } from './tenant-ai-config.js';
import { wrapModelWithTracing, wrapEmbeddingsWithTracing } from '../tracing/llm-tracer.js';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

// ============================================================================
// Types
// ============================================================================

/**
 * Logical purpose of the LLM call — maps to a model alias in LiteLLM's model_list.
 * LiteLLM resolves `${purpose}-${tier}` to a concrete provider + model at runtime.
 */
export type LLMPurpose = 'scoring' | 'qualification' | 'email' | 'reasoning' | 'structured' | 'rag';

/**
 * Cost / capability tier.
 * - free     → fast, cheapest (e.g. Groq Llama 3.1 8B, Mistral 7B)
 * - standard → balanced cost/quality (e.g. Mistral Small, Llama 3.1 70B)
 * - premium  → highest capability (e.g. Claude 3 Opus, GPT-4o)
 */
export type LLMTier = 'free' | 'standard' | 'premium';

export interface CreateLLMOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// ============================================================================
// LLM Instance Cache
// ============================================================================

/**
 * Module-level cache for `createLLM` instances.
 *
 * Cache key: `${provider}:${purpose}:${tier}:${temperature}:${maxTokens}:${timeout}`
 *
 * All six dimensions that affect the underlying model configuration are part of
 * the key so that different call-sites with different options never share an
 * incompatible instance.
 *
 * The provider is read at call-time (not module-load time) so that tests can
 * swap `aiConfig.provider` via `vi.doMock` and still get distinct cache entries.
 *
 * `__resetFactoryCache()` is exported for test `beforeEach` to prevent state
 * leaks between test cases that use `vi.resetModules()`.
 */
const _factoryCache = new Map<string, BaseChatModel>();

function _getFactoryCacheKey(
  purpose: LLMPurpose,
  tier: LLMTier,
  temperature: number,
  maxTokens: number,
  timeout: number
): string {
  const provider = aiConfig.provider;
  return `${provider}:${purpose}:${tier}:${temperature}:${maxTokens}:${timeout}`;
}

/** Reset the LLM instance cache — called in test `beforeEach` to prevent state leaks. */
export function __resetFactoryCache(): void {
  _factoryCache.clear();
}

// ============================================================================
// Production startup assertion (checked at most once per process)
// ============================================================================

let _prodKeyChecked = false;

/**
 * Assert that LITELLM_MASTER_KEY is set to a real value in production.
 * Runs at most once per process lifetime (result is cached in `_prodKeyChecked`).
 */
function _assertProdKey(): void {
  if (_prodKeyChecked) return;
  _prodKeyChecked = true;

  if (
    process.env['NODE_ENV'] === 'production' &&
    (!process.env['LITELLM_MASTER_KEY'] ||
      process.env['LITELLM_MASTER_KEY'] === 'sk-litellm-dev-change-me')
  ) {
    throw new Error('LITELLM_MASTER_KEY must be set to a real value in production');
  }
}

// ============================================================================
// Circuit Breaker Pool (H9)
// ============================================================================

/**
 * Per-provider + per-purpose circuit breaker pool.
 * Key: `${provider}:${purpose}-${tier}` so each provider/purpose pair trips
 * independently — a Groq rate-limit does not block Anthropic premium calls.
 *
 * Module-level map persists across calls; `__resetBreakers()` clears it for tests.
 */
const _breakerPool = new Map<string, CircuitBreaker>();

function _getBreakerKey(purpose: LLMPurpose, tier: LLMTier): string {
  const provider = aiConfig.provider; // read at call time, not module-load time
  return `${provider}:${purpose}-${tier}`;
}

/**
 * Get (or create) the circuit breaker for a given provider/purpose/tier combination.
 * Failure threshold = 5 failures, reset timeout = 60 s.
 */
export function getLLMBreaker(purpose: LLMPurpose, tier: LLMTier = 'free'): CircuitBreaker {
  const key = _getBreakerKey(purpose, tier);
  if (!_breakerPool.has(key)) {
    _breakerPool.set(key, new CircuitBreaker(5, 60_000));
  }
  return _breakerPool.get(key)!;
}

/**
 * Reset all circuit breakers — called in test `beforeEach` to prevent state leaks.
 * Also exported for the test mock file.
 */
export function __resetBreakers(): void {
  _breakerPool.clear();
}

// ============================================================================
// LLM Factory
// ============================================================================

/**
 * Factory for all chat-model instantiation in IntelliFlow CRM.
 *
 * Default path  : LiteLLM proxy → real providers (Groq, Mistral, Anthropic, OpenAI, Gemini).
 *                 Model name `${purpose}-${tier}` is resolved by LiteLLM's model_list in
 *                 infra/litellm/config.yaml — no provider SDK needed here.
 * Offline path  : local Ollama (aiConfig.provider === 'ollama').
 * Test path     : mock (aiConfig.provider === 'mock') — returns a ChatOpenAI pointed at a
 *                 stub URL; tests override via vi.mock('../lib/llm-factory.js', ...).
 *
 * Downstream chains (B2b scope) call:
 *   createLLM('scoring', 'free')
 *   createLLM('reasoning', 'premium', { temperature: 0.2 })
 */
export function createLLM(
  purpose: LLMPurpose,
  tier: LLMTier = 'free',
  options: CreateLLMOptions = {}
): BaseChatModel {
  const { temperature = 0.7, maxTokens = 2000, timeout = 120_000 } = options;

  // Production startup assertion — throws once if LITELLM_MASTER_KEY is unsafe.
  _assertProdKey();

  // Check the instance cache before allocating a new model object.
  const cacheKey = _getFactoryCacheKey(purpose, tier, temperature, maxTokens, timeout);
  const cached = _factoryCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let model: BaseChatModel;

  // Offline escape hatch — local Ollama only (no LiteLLM dependency).
  if (aiConfig.provider === 'ollama') {
    model = new ChatOllama({
      baseUrl: aiConfig.ollama.baseUrl,
      model: aiConfig.ollama.model,
      temperature,
    });
  } else if (aiConfig.provider === 'mock') {
    // Test path — aiConfig is normally singleton but tests override it via vi.mock.
    model = new ChatOpenAI({
      apiKey: 'mock-key',
      modelName: `${purpose}-${tier}`,
      temperature,
      maxTokens,
      timeout,
      configuration: { baseURL: 'http://mock-litellm' },
    });
  } else {
    // Primary path — LiteLLM proxy (covers 'litellm' and legacy 'openai' provider values).
    // LITELLM_BASE_URL is set by Phase B0 infra scaffolding; falls back to local dev default.
    model = new ChatOpenAI({
      apiKey: process.env['LITELLM_MASTER_KEY'] || 'sk-litellm-dev-change-me',
      modelName: `${purpose}-${tier}`,
      temperature,
      maxTokens,
      timeout,
      configuration: {
        baseURL: requiredProdEnv(
          'LITELLM_BASE_URL',
          process.env['LITELLM_BASE_URL'],
          'http://localhost:4000/v1'
        ),
      },
    });
  }

  // Wrap with OTel tracing so every .invoke() call emits an llm.invoke span.
  const instrumented = wrapModelWithTracing(model, { purpose, tier });
  _factoryCache.set(cacheKey, instrumented);
  return instrumented;
}

/**
 * Tenant-aware async sibling of `createLLM`.
 *
 * Resolves the effective tier from `TenantAIConfig` for the given tenant and
 * purpose, then delegates to `createLLM` with the resolved tier.
 *
 * Tier overrides are:
 * - Tenant-scoped (one row per `tenantId × purpose`)
 * - Cache-backed with a 60-second TTL (matches circuit-breaker reset timeout)
 * - Fail-open: DB errors fall back to `tier` so chains stay operational
 *
 * Per-tenant `temperature` and `maxTokens` DB overrides take precedence over
 * values in `options`, allowing fine-grained per-tenant model tuning without
 * code changes.
 *
 * Circuit-breaker key is `${provider}:${purpose}-${effectiveTier}` — the same
 * formula used internally by `getLLMBreaker` — so a per-tenant premium tier
 * gets its own independent breaker from the free-tier breaker.
 *
 * @param purpose   - Logical LLM purpose (maps to a LiteLLM model alias)
 * @param tier      - Default tier used when no tenant override exists
 * @param options   - Options including `tenantId` (required) and optional
 *                    `temperature`, `maxTokens`, `timeout`
 */
export async function createLLMForTenant(
  purpose: LLMPurpose,
  tier: LLMTier = 'free',
  options: CreateLLMOptions & { tenantId: string }
): Promise<BaseChatModel> {
  const { tenantId, ...chatOptions } = options;

  const resolved = await resolveEffectiveTier(tenantId, purpose, tier);
  const effectiveTier = resolved.tier;

  // Per-tenant DB overrides take precedence over caller-supplied options.
  const effectiveOptions: CreateLLMOptions = {
    ...chatOptions,
    ...(resolved.temperature != null ? { temperature: resolved.temperature } : {}),
    ...(resolved.maxTokens != null ? { maxTokens: resolved.maxTokens } : {}),
  };

  return createLLM(purpose, effectiveTier, effectiveOptions);
}

/**
 * Sibling factory for embedding models.
 * Follows the same provider routing logic as createLLM().
 *
 * The logical model name `rag-${tier}` is resolved by LiteLLM's model_list to a
 * concrete embeddings provider (see infra/litellm/config.yaml):
 *   rag-free    → ollama/nomic-embed-text (local, 768 dims)
 *   rag-premium → openai/text-embedding-3-small (cloud, 1536 dims)
 */
export function createEmbeddings(tier: LLMTier = 'free'): Embeddings {
  // Offline — Ollama does not expose a standard embeddings interface via @langchain/ollama
  // in the same way, so we fall through to the LiteLLM path even in ollama mode.
  // If a local embeddings server is needed, configure LITELLM_BASE_URL to point at it.

  let embeddings: Embeddings;

  // Test path
  if (aiConfig.provider === 'mock') {
    embeddings = new OpenAIEmbeddings({
      apiKey: 'mock-key',
      modelName: `rag-${tier}`,
      configuration: { baseURL: 'http://mock-litellm' },
    });
  } else {
    // Primary + ollama fallback — both route through LiteLLM proxy.
    embeddings = new OpenAIEmbeddings({
      apiKey: process.env['LITELLM_MASTER_KEY'] || 'sk-litellm-dev-change-me',
      modelName: `rag-${tier}`,
      configuration: {
        baseURL: requiredProdEnv(
          'LITELLM_BASE_URL',
          process.env['LITELLM_BASE_URL'],
          'http://localhost:4000/v1'
        ),
      },
    });
  }

  // Wrap with OTel tracing so every .embedQuery() / .embedDocuments() call
  // emits an llm.embed span. Guard inside wrapEmbeddingsWithTracing handles
  // mocks that don't implement the embeddings interface.
  return wrapEmbeddingsWithTracing(embeddings, { tier });
}
