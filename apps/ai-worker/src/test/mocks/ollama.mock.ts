/**
 * Mock implementations for @langchain/ollama (local LLM)
 *
 * Usage in tests:
 * ```typescript
 * vi.mock('@langchain/ollama', () => require('./test/mocks/ollama.mock'));
 * ```
 */

import { vi } from 'vitest';
import { DEFAULT_SCORING_RESPONSE, DEFAULT_EMBEDDING_RESPONSE } from './langchain-openai.mock';

/**
 * Create a mock ChatOllama instance with customizable response.
 * The `withStructuredOutput` method is included so Pattern B tests that
 * switch to structured output don't explode.
 */
export function createMockChatOllama(response: unknown = DEFAULT_SCORING_RESPONSE) {
  const MockChatOllama = function (this: Record<string, unknown>) {
    this.invoke = vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
    });
    this.stream = vi.fn().mockImplementation(async function* () {
      yield { content: JSON.stringify(response) };
    });
    this.bind = vi.fn().mockReturnThis();
    this.pipe = vi.fn().mockReturnThis();
    // withStructuredOutput returns a mock that resolves with the parsed object directly
    this.withStructuredOutput = vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue(response),
    });
  };
  return MockChatOllama;
}

/**
 * Create a mock OllamaEmbeddings instance
 */
export function createMockOllamaEmbeddings(
  embedding: number[] = DEFAULT_EMBEDDING_RESPONSE.embedding
) {
  const MockOllamaEmbeddings = function (this: Record<string, unknown>) {
    this.embedQuery = vi.fn().mockResolvedValue(embedding);
    this.embedDocuments = vi.fn().mockImplementation(async (docs: string[]) => {
      return docs.map(() => embedding);
    });
  };
  return MockOllamaEmbeddings;
}

/**
 * Default export for vi.mock('@langchain/ollama', () => require(...))
 */
export const ChatOllama = createMockChatOllama();
export const OllamaEmbeddings = createMockOllamaEmbeddings();
