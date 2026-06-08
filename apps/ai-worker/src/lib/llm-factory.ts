import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import { aiConfig, AIProviderSchema, type AIProvider } from '../config/ai.config.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { resolveEffectiveTier } from './tenant-ai-config.js';
import { wrapModelWithTracing, wrapEmbeddingsWithTracing } from '../tracing/llm-tracer.js';
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { GeminiEmbeddings } from './gemini-embeddings.js';

/**
 * Resolve the OpenRouter chat model for a tier. Per-tier overrides via
 * `OPENROUTER_MODEL_{FREE,STANDARD,PREMIUM}`, else the single `OPENROUTER_MODEL`,
 * else cao's proven free default. Lets ops retune models without a deploy.
 */
function openRouterModelForTier(tier: LLMTier): string {
  return (
    process.env[`OPENROUTER_MODEL_${tier.toUpperCase()}`] ||
    process.env['OPENROUTER_MODEL'] ||
    'openai/gpt-oss-120b:free'
  );
}

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
  /**
   * Override the active provider for THIS instance only (does not touch the
   * global `aiConfig.provider`). Used by the job-level provider fallback (#324)
   * to build a model on the secondary provider when the primary fails. Threaded
   * into the cache key so the fallback model is cached separately.
   */
  provider?: AIProvider;
}

// ============================================================================
// Body-safe fetch (prod incident 2026-06)
// ============================================================================

/**
 * Wrap a fetch implementation so the OpenAI SDK always receives a response whose
 * body is fully materialized and readable — regardless of what any interceptor
 * or retry path did to the upstream stream.
 *
 * Symptom (prod 2026-06): `scoring-chain` / `insight-generation-chain` failed
 * with `TypeError: Body is unusable: Body has already been read`. Both call the
 * LLM via `createLLM()` → `ChatOpenAI` (OpenAI SDK → undici `fetch`).
 *
 * IMPORTANT — this is a DEFENSIVE measure, not a verified fix. The exact second
 * reader of the body was never reproduced. OTel's undici instrumentation reads
 * request/response *metadata via diagnostics channels — it does NOT consume the
 * body*, so it is unlikely to be the cause. Candidates (an SDK/LangChain retry
 * re-read, or a litellm-era artifact predating the OpenRouter migration) and the
 * post-deploy verification plan are tracked in #334. If a double-read happens on
 * the *returned* response (SDK reads it twice), no fetch-layer wrapper can help —
 * `Response` bodies are single-use.
 *
 * Strategy: read the upstream body ONCE here and hand the SDK a brand-new
 * `Response` built from the buffered bytes, so nothing upstream can leave it
 * half-consumed. `content-encoding`/`content-length` are dropped because `fetch`
 * has already decompressed the body — the re-wrapped Response must not advertise
 * the original encoding or the SDK would try to decompress again. Streaming
 * (`text/event-stream`) is passed through untouched so we never buffer token
 * streams. Best-effort: if the upstream body was already disturbed, fall back to
 * the original rather than make things worse.
 */
export function createBodySafeFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const response = await baseFetch(input, init);
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body || contentType.includes('text/event-stream')) {
      return response;
    }
    try {
      const buffered = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      return new Response(buffered, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      // Upstream body already disturbed — nothing safe left to do; hand it back.
      return response;
    }
  }) as typeof fetch;
}

/**
 * Process-wide singleton wrapper so every cached `ChatOpenAI`/`OpenAIEmbeddings`
 * instance shares one allocation. Captured at module-load against the (possibly
 * OTel-patched) global `fetch`, so telemetry spans are still emitted.
 */
const bodySafeFetch = createBodySafeFetch();

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
  provider: AIProvider,
  purpose: LLMPurpose,
  tier: LLMTier,
  temperature: number,
  maxTokens: number,
  timeout: number
): string {
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
 * Resolve the configured fallback provider for the job-level provider fallback
 * (#324). Reads `AI_FALLBACK_PROVIDER` (e.g. `litellm` when the primary is
 * `openrouter`). Returns null — i.e. "no fallback, go straight to the heuristic" —
 * when it is unset, invalid, the no-op `mock` provider, or identical to the
 * active provider (falling back to the same provider is pointless).
 */
export function resolveFallbackProvider(): AIProvider | null {
  const raw = (process.env['AI_FALLBACK_PROVIDER'] || '').trim();
  if (!raw) return null;
  const parsed = AIProviderSchema.safeParse(raw);
  if (!parsed.success) return null;
  const fallback = parsed.data;
  if (fallback === 'mock' || fallback === aiConfig.provider) return null;
  return fallback;
}

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

  // Provider for THIS instance — the caller may override (job-level fallback,
  // #324); otherwise use the global singleton.
  const provider = options.provider ?? aiConfig.provider;

  // LITELLM_MASTER_KEY only matters for the litellm proxy path — gate the
  // assertion so AI_PROVIDER=openrouter/ollama/mock don't trip it. (#238)
  if (provider === 'litellm') _assertProdKey();

  // Check the instance cache before allocating a new model object.
  const cacheKey = _getFactoryCacheKey(provider, purpose, tier, temperature, maxTokens, timeout);
  const cached = _factoryCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let model: BaseChatModel;

  // Offline escape hatch — local Ollama only (no LiteLLM dependency).
  if (provider === 'ollama') {
    model = new ChatOllama({
      baseUrl: aiConfig.ollama.baseUrl,
      model: aiConfig.ollama.model,
      temperature,
    });
  } else if (provider === 'mock') {
    // Test path — aiConfig is normally singleton but tests override it via vi.mock.
    model = new ChatOpenAI({
      apiKey: 'mock-key',
      modelName: `${purpose}-${tier}`,
      temperature,
      maxTokens,
      timeout,
      configuration: { baseURL: 'http://mock-litellm' },
    });
  } else if (provider === 'openrouter') {
    // OpenRouter is OpenAI-compatible — real model ids (e.g. openai/gpt-oss-120b:free),
    // NOT the litellm logical `${purpose}-${tier}` aliases. Used for production chat
    // (free models); dev stays on Ollama. No proxy required.
    model = new ChatOpenAI({
      apiKey: process.env['OPENROUTER_API_KEY'] || '',
      modelName: openRouterModelForTier(tier),
      temperature,
      maxTokens,
      timeout,
      configuration: {
        baseURL: process.env['OPENROUTER_BASE_URL'] || 'https://openrouter.ai/api/v1',
        // OpenRouter attribution headers (recommended, optional).
        defaultHeaders: {
          'HTTP-Referer': process.env['OPENROUTER_SITE_URL'] || 'https://intelliflow-crm.app',
          'X-Title': 'IntelliFlow CRM',
        },
        // Body-safe fetch — this is the PRODUCTION path (OpenRouter free models),
        // so the "Body has already been read" double-read fix must live here too,
        // not just on the legacy litellm/openai branch below.
        fetch: bodySafeFetch,
      },
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
        // Provider-gate the LITELLM_BASE_URL fail-fast. requiredProdEnv() stays
        // loud for AI_PROVIDER=litellm, but the openai direct path (ADR-048)
        // falls back instead of throwing at module-init: `new EmbeddingChain()`
        // runs createEmbeddings() at import time, so an unconditional throw here
        // crash-looped ai-worker in production with AI_PROVIDER=openai. See #238.
        baseURL:
          provider === 'litellm'
            ? requiredProdEnv(
                'LITELLM_BASE_URL',
                process.env['LITELLM_BASE_URL'],
                'http://localhost:4000/v1'
              )
            : process.env['LITELLM_BASE_URL'] || 'http://localhost:4000/v1',
        // Body-safe fetch — prevents "Body has already been read" when OTel fetch
        // instrumentation consumes the response stream alongside the SDK.
        fetch: bodySafeFetch,
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
  } else if (process.env['EMBEDDING_PROVIDER'] === 'gemini') {
    // Production embeddings via Google `gemini-embedding-001` at a dimension that
    // matches the pgvector(1536) columns (no DB migration). OpenRouter has no free
    // embeddings, so chat (OpenRouter) and embeddings (Gemini) are decoupled. The
    // adapter makes no network call at construction, so module-init stays safe.
    embeddings = new GeminiEmbeddings({
      apiKey: process.env['GEMINI_API_KEY'] || '',
      model: process.env['GEMINI_EMBEDDING_MODEL'] || 'gemini-embedding-001',
      dimensions: Number.parseInt(process.env['EMBEDDING_DIMENSIONS'] || '1536', 10),
    });
  } else {
    // Primary + ollama fallback — both route through LiteLLM proxy.
    embeddings = new OpenAIEmbeddings({
      apiKey: process.env['LITELLM_MASTER_KEY'] || 'sk-litellm-dev-change-me',
      modelName: `rag-${tier}`,
      configuration: {
        // Provider-gate the LITELLM_BASE_URL fail-fast. requiredProdEnv() stays
        // loud for AI_PROVIDER=litellm, but the openai direct path (ADR-048)
        // falls back instead of throwing at module-init: `new EmbeddingChain()`
        // runs createEmbeddings() at import time, so an unconditional throw here
        // crash-looped ai-worker in production with AI_PROVIDER=openai. See #238.
        baseURL:
          aiConfig.provider === 'litellm'
            ? requiredProdEnv(
                'LITELLM_BASE_URL',
                process.env['LITELLM_BASE_URL'],
                'http://localhost:4000/v1'
              )
            : process.env['LITELLM_BASE_URL'] || 'http://localhost:4000/v1',
        // Body-safe fetch — see createBodySafeFetch (prevents double-read of the
        // response body when OTel fetch instrumentation is active).
        fetch: bodySafeFetch,
      },
    });
  }

  // Wrap with OTel tracing so every .embedQuery() / .embedDocuments() call
  // emits an llm.embed span. Guard inside wrapEmbeddingsWithTracing handles
  // mocks that don't implement the embeddings interface.
  return wrapEmbeddingsWithTracing(embeddings, { tier });
}
