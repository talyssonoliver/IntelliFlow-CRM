import { z } from 'zod';

/**
 * AI Provider Configuration
 * Supports both OpenAI (production) and Ollama (local development)
 */

export const AIProviderSchema = z.enum(['openai', 'ollama']);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const AIConfigSchema = z.object({
  // Provider selection
  provider: AIProviderSchema.default('openai'),

  // OpenAI Configuration
  openai: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('gpt-4-turbo-preview'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(2000),
    timeout: z.number().positive().default(30000), // 30 seconds
  }),

  // Ollama Configuration (local development)
  ollama: z.object({
    baseUrl: z.string().url().default('http://localhost:11434'),
    model: z.string().default('mistral'),
    temperature: z.number().min(0).max(2).default(0.7),
    timeout: z.number().positive().default(60000), // 60 seconds
  }),

  // Cost tracking
  costTracking: z.object({
    enabled: z.boolean().default(true),
    warningThreshold: z.number().positive().default(10.0), // $10 USD
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
  const provider = (process.env.AI_PROVIDER || 'openai') as AIProvider;

  const config: AIConfig = {
    provider,

    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000', 10),
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000', 10),
    },

    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'mistral',
      temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '60000', 10),
    },

    costTracking: {
      enabled: process.env.COST_TRACKING_ENABLED !== 'false',
      warningThreshold: parseFloat(process.env.COST_WARNING_THRESHOLD || '10.0'),
      dailyLimit: process.env.COST_DAILY_LIMIT
        ? parseFloat(process.env.COST_DAILY_LIMIT)
        : undefined,
    },

    performance: {
      cacheEnabled: process.env.AI_CACHE_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.AI_CACHE_TTL || '3600', 10),
      rateLimitPerMinute: parseInt(process.env.AI_RATE_LIMIT || '60', 10),
      retryAttempts: parseInt(process.env.AI_RETRY_ATTEMPTS || '3', 10),
      retryDelay: parseInt(process.env.AI_RETRY_DELAY || '1000', 10),
    },

    features: {
      enableChainLogging: process.env.ENABLE_CHAIN_LOGGING !== 'false',
      enableConfidenceScores: process.env.ENABLE_CONFIDENCE_SCORES !== 'false',
      enableStructuredOutputs: process.env.ENABLE_STRUCTURED_OUTPUTS !== 'false',
      enableMultiAgentWorkflows: process.env.ENABLE_MULTI_AGENT === 'true',
    },
  };

  // Validate configuration
  return AIConfigSchema.parse(config);
}

/**
 * Model pricing (USD per 1K tokens)
 * Used for cost tracking
 */
export const MODEL_PRICING = {
  'gpt-4-turbo-preview': {
    input: 0.01,
    output: 0.03,
  },
  'gpt-4': {
    input: 0.03,
    output: 0.06,
  },
  'gpt-3.5-turbo': {
    input: 0.0005,
    output: 0.0015,
  },
  'ollama': {
    input: 0,
    output: 0,
  },
} as const;

export type ModelName = keyof typeof MODEL_PRICING;

/**
 * Calculate cost for a given number of tokens
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model as ModelName] || MODEL_PRICING['gpt-3.5-turbo'];

  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Default configuration instance
 */
export const aiConfig = loadAIConfig();
