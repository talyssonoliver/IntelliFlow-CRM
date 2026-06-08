import { z } from 'zod';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

/**
 * AI Provider Configuration
 * Supports both OpenAI (production) and Ollama (local development)
 */

export const AIProviderSchema = z.enum(['litellm', 'openai', 'ollama', 'mock', 'openrouter']);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const AIConfigSchema = z.object({
  // Provider selection
  provider: AIProviderSchema.default('litellm'),

  // OpenAI Configuration
  openai: z.object({
    apiKey: z.string().optional(),
    // Optional OpenAI-compatible endpoint (e.g., vLLM)
    baseUrl: z.url().optional(),
    model: z.string().default('gpt-4-turbo-preview'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(2000),
    timeout: z.number().positive().default(30000), // 30 seconds
  }),

  // LiteLLM Proxy Configuration (primary production path)
  // LiteLLM normalises all providers (Groq, Mistral, Anthropic, OpenAI, Gemini) behind
  // a single OpenAI-compatible endpoint.  Model selection is handled by LiteLLM's
  // model_list in infra/litellm/config.yaml — no per-provider SDK needed here.
  litellm: z.object({
    baseUrl: z.string().default('http://localhost:4000/v1'),
    masterKey: z.string().default(''),
    timeout: z.number().positive().default(120_000), // 120 seconds
  }),

  // Ollama Configuration (local development)
  ollama: z.object({
    baseUrl: z.url().default('http://localhost:11434'),
    model: z.string().default('mistral'),
    temperature: z.number().min(0).max(2).default(0.7),
    timeout: z.number().positive().default(60000), // 60 seconds
  }),

  // Cost tracking
  costTracking: z.object({
    enabled: z.boolean().default(true),
    warningThreshold: z.number().positive().default(10), // $10 USD
    dailyLimit: z.number().positive().optional(),
  }),

  // Performance settings
  performance: z.object({
    cacheEnabled: z.boolean().default(true),
    cacheTTL: z.number().positive().default(3600), // 1 hour in seconds
    rateLimitPerMinute: z.number().positive().default(60),
    retryAttempts: z.number().min(0).max(5).default(3),
    retryDelay: z.number().positive().default(1000), // 1 second
  }),

  // Feature flags
  features: z.object({
    enableChainLogging: z.boolean().default(true),
    enableConfidenceScores: z.boolean().default(true),
    enableStructuredOutputs: z.boolean().default(true),
    enableMultiAgentWorkflows: z.boolean().default(false),
  }),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

/**
 * Load AI configuration from environment variables
 */
export function loadAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER || 'litellm') as AIProvider;
  const openAIBaseUrl = (process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || '').trim();

  // Only the ACTIVE provider's base URL is required in production. This mirrors
  // the provider-gated requiredProdEnv() in apps/api/src/container.ts and honors
  // ADR-048: with AI_PROVIDER=openai (or mock) the worker uses the direct-client
  // path and needs NEITHER LITELLM_BASE_URL nor OLLAMA_BASE_URL set. Calling
  // requiredProdEnv() unconditionally here crash-looped ai-worker in production
  // when only the OpenAI path was configured (see ADR-048). For an inactive
  // provider we keep the plain dev-default fallback (it is never dialed).
  const litellmBaseUrl =
    provider === 'litellm'
      ? requiredProdEnv(
          'LITELLM_BASE_URL',
          process.env['LITELLM_BASE_URL'],
          'http://localhost:4000/v1'
        )
      : process.env['LITELLM_BASE_URL'] || 'http://localhost:4000/v1';
  const ollamaBaseUrl =
    provider === 'ollama'
      ? requiredProdEnv('OLLAMA_BASE_URL', process.env.OLLAMA_BASE_URL, 'http://localhost:11434')
      : process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  const config: AIConfig = {
    provider,

    litellm: {
      baseUrl: litellmBaseUrl,
      masterKey: process.env['LITELLM_MASTER_KEY'] || '',
      timeout: Number.parseInt(process.env['LITELLM_TIMEOUT'] || '120000', 10),
    },

    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: openAIBaseUrl || undefined,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      temperature: Number.parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      maxTokens: Number.parseInt(process.env.OPENAI_MAX_TOKENS || '2000', 10),
      timeout: Number.parseInt(process.env.OPENAI_TIMEOUT || '30000', 10),
    },

    ollama: {
      baseUrl: ollamaBaseUrl,
      model: process.env.OLLAMA_MODEL || 'mistral',
      temperature: Number.parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
      timeout: Number.parseInt(process.env.OLLAMA_TIMEOUT || '60000', 10),
    },

    costTracking: {
      enabled: process.env.COST_TRACKING_ENABLED !== 'false',
      warningThreshold: Number.parseFloat(process.env.COST_WARNING_THRESHOLD || '10'),
      dailyLimit: process.env.COST_DAILY_LIMIT
        ? Number.parseFloat(process.env.COST_DAILY_LIMIT)
        : undefined,
    },

    performance: {
      cacheEnabled: process.env.AI_CACHE_ENABLED !== 'false',
      cacheTTL: Number.parseInt(process.env.AI_CACHE_TTL || '3600', 10),
      rateLimitPerMinute: Number.parseInt(process.env.AI_RATE_LIMIT || '60', 10),
      retryAttempts: Number.parseInt(process.env.AI_RETRY_ATTEMPTS || '3', 10),
      retryDelay: Number.parseInt(process.env.AI_RETRY_DELAY || '1000', 10),
    },

    features: {
      enableChainLogging: process.env.ENABLE_CHAIN_LOGGING !== 'false',
      enableConfidenceScores: process.env.ENABLE_CONFIDENCE_SCORES !== 'false',
      enableStructuredOutputs: process.env.ENABLE_STRUCTURED_OUTPUTS !== 'false',
      enableMultiAgentWorkflows: process.env.ENABLE_MULTI_AGENT === 'true',
    },
  };

  // Validate configuration
  const parsed = AIConfigSchema.parse(config);

  // Production guardrail (incident 2026-06): never silently run on the `mock`
  // provider in production. A mock provider resolves model="mock"/endpoint="mock",
  // performs ZERO real LLM calls, reports $0.00 cost, and degrades invisibly
  // (observed: a 53-minute prod window of no-op scoring/insight jobs). Fail fast
  // with a clear, actionable error instead of booting into a silent no-op.
  if (parsed.provider === 'mock' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Invalid AI configuration: AI_PROVIDER="mock" is not permitted when NODE_ENV=production. ' +
        'Set AI_PROVIDER to "litellm" (LiteLLM proxy → OpenRouter/OpenAI/Anthropic/etc.) or "openai", ' +
        'and supply valid credentials (LITELLM_BASE_URL + LITELLM_MASTER_KEY, or OPENAI_API_KEY) ' +
        'plus live model routing. Refusing to start to avoid silent zero-op operation.'
    );
  }

  return parsed;
}

/**
 * Model pricing (USD per 1K tokens)
 * Used for cost tracking
 *
 * IFC-029: Added GPT-4o-mini pricing for <1s latency auto-response
 *
 * ADR-048: Added logical LiteLLM model names (${purpose}-${tier}) so
 * costTracker.recordUsage() correctly prices calls regardless of provider.
 * Pricing derived from infra/litellm/config.yaml routing table (2026-04-16):
 *
 *   FREE tier
 *     scoring-free / email-free  → groq/llama-3.1-8b-instant   $0.05/$0.08 per M
 *     qualification-free         → groq/llama-3.3-70b-versatile $0.59/$0.79 per M
 *     reasoning-free             → openrouter free tier          $0 / $0
 *     structured-free            → gemini-2.5-flash              $0.075/$0.30 per M
 *     rag-free                   → ollama/nomic-embed-text        $0 / $0
 *
 *   STANDARD tier
 *     scoring-standard / structured-standard → mistral-small    $0.2/$0.6 per M
 *     qualification-standard                 → mistral-medium   $1.0/$3.0 per M
 *     email-standard                         → groq/llama-3.3-70b-versatile $0.59/$0.79 per M
 *     reasoning-standard                     → claude-haiku-4-5 $0.8/$4.0 per M
 *
 *   PREMIUM tier
 *     scoring-premium            → gpt-4o-mini                   $0.15/$0.60 per M
 *     qualification-premium / structured-premium → gpt-4o       $2.5/$10.0 per M
 *     email-premium              → claude-haiku-4-5              $0.8/$4.0 per M
 *     reasoning-premium          → claude-sonnet-4-5             $3.0/$15.0 per M
 *     rag-premium                → text-embedding-3-small        $0.02/n/a  per M
 */
export const MODEL_PRICING = {
  'gpt-4-turbo-preview': {
    input: 0.01,
    output: 0.03,
  },
  'gpt-4-turbo': {
    input: 0.01,
    output: 0.03,
  },
  'gpt-4': {
    input: 0.03,
    output: 0.06,
  },
  // IFC-029: GPT-4o-mini for <1s auto-response latency
  'gpt-4o-mini': {
    input: 0.00015,
    output: 0.0006,
  },
  'gpt-4o': {
    input: 0.0025,
    output: 0.01,
  },
  'gpt-3.5-turbo': {
    input: 0.0005,
    output: 0.0015,
  },
  ollama: {
    input: 0,
    output: 0,
  },

  // ----------------------------------------------------------------
  // ADR-048: LiteLLM logical model names — ${purpose}-${tier}
  // ----------------------------------------------------------------

  // --- free tier ---
  // groq/llama-3.1-8b-instant: $0.05 input / $0.08 output per M tokens
  'scoring-free': { input: 0.00005, output: 0.00008 },
  'email-free': { input: 0.00005, output: 0.00008 },
  // groq/llama-3.3-70b-versatile: $0.59/$0.79 per M
  'qualification-free': { input: 0.00059, output: 0.00079 },
  // openrouter free tier: $0
  'reasoning-free': { input: 0, output: 0 },
  // gemini-2.5-flash: $0.075/$0.30 per M
  'structured-free': { input: 0.000075, output: 0.0003 },
  // ollama/nomic-embed-text: $0 (local)
  'rag-free': { input: 0, output: 0 },

  // --- standard tier ---
  // mistral-small: $0.2/$0.6 per M
  'scoring-standard': { input: 0.0002, output: 0.0006 },
  'structured-standard': { input: 0.0002, output: 0.0006 },
  // mistral-medium: $1.0/$3.0 per M
  'qualification-standard': { input: 0.001, output: 0.003 },
  // groq/llama-3.3-70b-versatile: $0.59/$0.79 per M
  'email-standard': { input: 0.00059, output: 0.00079 },
  // claude-haiku-4-5: $0.8/$4.0 per M
  'reasoning-standard': { input: 0.0008, output: 0.004 },

  // --- premium tier ---
  // gpt-4o-mini: $0.15/$0.60 per M
  'scoring-premium': { input: 0.00015, output: 0.0006 },
  // gpt-4o: $2.5/$10.0 per M
  'qualification-premium': { input: 0.0025, output: 0.01 },
  'structured-premium': { input: 0.0025, output: 0.01 },
  // claude-haiku-4-5: $0.8/$4.0 per M
  'email-premium': { input: 0.0008, output: 0.004 },
  // claude-sonnet-4-5: $3.0/$15.0 per M
  'reasoning-premium': { input: 0.003, output: 0.015 },
  // openai/text-embedding-3-small: $0.02/M (input only; no output tokens for embeddings)
  'rag-premium': { input: 0.00002, output: 0 },
} as const;

export type ModelName = keyof typeof MODEL_PRICING;

/**
 * Calculate cost for a given number of tokens
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model as ModelName] || MODEL_PRICING['gpt-3.5-turbo'];

  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Default configuration instance
 *
 * NOTE: This relies on env.ts being imported first in the ai-worker entry point
 * so that process.env is populated before this module evaluates.
 */
export const aiConfig = loadAIConfig();
