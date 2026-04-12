import { aiConfig } from '../config/ai.config';

const OPENAI_COMPAT_FALLBACK_API_KEY = 'local-openai-compatible';

export type OpenAIEndpointKind = 'openai' | 'openai-compatible';

export interface OpenAIClientSettings {
  apiKey?: string;
  configuration?: {
    baseURL: string;
  };
  endpoint: OpenAIEndpointKind;
}

/**
 * Resolve OpenAI client settings, including OpenAI-compatible endpoints (e.g. vLLM).
 * If a custom base URL is configured, we inject a fallback API key because many
 * OpenAI-compatible servers only require a non-empty Authorization header.
 */
export function getOpenAIClientSettings(): OpenAIClientSettings {
  const baseUrl = aiConfig.openai.baseUrl?.trim();

  if (baseUrl) {
    return {
      apiKey:
        aiConfig.openai.apiKey ||
        process.env.OPENAI_COMPAT_API_KEY ||
        OPENAI_COMPAT_FALLBACK_API_KEY,
      configuration: {
        baseURL: baseUrl,
      },
      endpoint: 'openai-compatible',
    };
  }

  return {
    apiKey: aiConfig.openai.apiKey,
    endpoint: 'openai',
  };
}
