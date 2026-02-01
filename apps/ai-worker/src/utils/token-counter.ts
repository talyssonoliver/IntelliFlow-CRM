/**
 * Token counting utilities for LangChain messages and text
 *
 * Uses js-tiktoken for accurate OpenAI token counting with fallback
 * to character-based estimation when encoding is unavailable.
 *
 * @module token-counter
 */

import { BaseMessage } from '@langchain/core/messages';
import pino from 'pino';

const logger = pino({
  name: 'token-counter',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Tiktoken encoder interface (matches js-tiktoken Tiktoken class)
 */
interface TiktokenEncoder {
  encode: (text: string) => number[];
  decode: (tokens: number[]) => string;
  free: () => void;
}

/**
 * Type for the tiktoken module's getEncoding function
 */
type GetEncodingFn = (name: string) => TiktokenEncoder;

/**
 * Module state for lazy loading
 */
let getEncodingFn: GetEncodingFn | null = null;
let moduleLoadAttempted = false;

/**
 * Load js-tiktoken module dynamically (ESM compatibility)
 */
async function loadTiktoken(): Promise<GetEncodingFn | null> {
  if (getEncodingFn) return getEncodingFn;
  if (moduleLoadAttempted) return null;

  moduleLoadAttempted = true;

  try {
    // Dynamic import for ESM module
    const mod = await import('js-tiktoken');
    getEncodingFn = mod.getEncoding as GetEncodingFn;
    logger.debug('js-tiktoken module loaded successfully');
    return getEncodingFn;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to load js-tiktoken, using estimation fallback'
    );
    return null;
  }
}

// Pre-load tiktoken module on initialization
const loadPromise = loadTiktoken();

/**
 * Model to encoding name mapping for OpenAI models
 * cl100k_base is used for GPT-4 and GPT-3.5-turbo models
 */
const MODEL_ENCODINGS: Record<string, string> = {
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4-turbo-preview': 'cl100k_base',
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-3.5-turbo-16k': 'cl100k_base',
  'text-embedding-ada-002': 'cl100k_base',
  'text-embedding-3-small': 'cl100k_base',
  'text-embedding-3-large': 'cl100k_base',
};

/**
 * Cached encoder instances for performance
 */
const encoderCache = new Map<string, TiktokenEncoder>();

/**
 * Get the encoding for a model, with caching
 */
function getEncoderForModelSync(model?: string): TiktokenEncoder | null {
  if (!getEncodingFn) return null;

  const encodingName = model ? MODEL_ENCODINGS[model] || 'cl100k_base' : 'cl100k_base';

  if (!encoderCache.has(encodingName)) {
    try {
      const encoder = getEncodingFn(encodingName);
      encoderCache.set(encodingName, encoder);
      logger.debug({ encodingName, model }, 'Created token encoder');
    } catch (error) {
      logger.warn(
        { encodingName, model, error: error instanceof Error ? error.message : String(error) },
        'Failed to create encoder, falling back to cl100k_base'
      );
      // Fall back to cl100k_base if the specific encoding fails
      if (!encoderCache.has('cl100k_base')) {
        try {
          const fallbackEncoder = getEncodingFn('cl100k_base');
          encoderCache.set('cl100k_base', fallbackEncoder);
        } catch {
          return null;
        }
      }
      return encoderCache.get('cl100k_base') || null;
    }
  }

  return encoderCache.get(encodingName) || null;
}

/**
 * Token counter interface
 */
export interface TokenCounter {
  /**
   * Count tokens in a text string
   */
  countTokens(text: string): number;

  /**
   * Count tokens in an array of LangChain messages
   */
  countMessages(messages: BaseMessage[]): number;
}

/**
 * Create a token counter for a specific model
 *
 * @param model - Optional model name (e.g., 'gpt-4', 'gpt-3.5-turbo')
 * @returns TokenCounter instance
 */
export function createTokenCounter(model?: string): TokenCounter {
  return {
    countTokens(text: string): number {
      if (!text || text.length === 0) {
        return 0;
      }

      const encoder = getEncoderForModelSync(model);
      if (!encoder) {
        return estimateTokensFromChars(text);
      }

      try {
        return encoder.encode(text).length;
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Token encoding failed, using estimation'
        );
        return estimateTokensFromChars(text);
      }
    },

    countMessages(messages: BaseMessage[]): number {
      if (!messages || messages.length === 0) {
        return 0;
      }

      const encoder = getEncoderForModelSync(model);
      let totalTokens = 0;

      for (const message of messages) {
        // Each message has overhead for role and message structure
        // OpenAI uses approximately 4 tokens per message for structure
        const messageOverhead = 4;

        const content =
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);

        if (encoder) {
          try {
            totalTokens += encoder.encode(content).length + messageOverhead;
          } catch {
            totalTokens += estimateTokensFromChars(content) + messageOverhead;
          }
        } else {
          totalTokens += estimateTokensFromChars(content) + messageOverhead;
        }
      }

      // Add 2 tokens for the overall prompt structure
      return totalTokens + 2;
    },
  };
}

/**
 * Count tokens in a text string using the default encoder
 *
 * @param text - Text to count tokens for
 * @param model - Optional model name for accurate counting
 * @returns Number of tokens
 */
export function countTokens(text: string, model?: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  const encoder = getEncoderForModelSync(model);
  if (!encoder) {
    return estimateTokensFromChars(text);
  }

  try {
    return encoder.encode(text).length;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Token encoding failed, using estimation'
    );
    return estimateTokensFromChars(text);
  }
}

/**
 * Count tokens in an array of LangChain messages
 *
 * @param messages - Array of BaseMessage instances
 * @param model - Optional model name for accurate counting
 * @returns Total token count including message overhead
 */
export function countMessagesTokens(messages: BaseMessage[], model?: string): number {
  if (!messages || messages.length === 0) {
    return 0;
  }

  const counter = createTokenCounter(model);
  return counter.countMessages(messages);
}

/**
 * Estimate tokens from character count (fallback method)
 *
 * Uses the approximation of ~4 characters per token for English text.
 * This is less accurate but works when encoding fails.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated number of tokens (rounded up)
 */
export function estimateTokensFromChars(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Clear the encoder cache (useful for testing)
 */
export function clearEncoderCache(): void {
  encoderCache.clear();
}

/**
 * Wait for tiktoken module to be loaded
 * Call this if you need to ensure accurate counting is available
 */
export async function ensureTiktokenLoaded(): Promise<boolean> {
  await loadPromise;
  return getEncodingFn !== null;
}
