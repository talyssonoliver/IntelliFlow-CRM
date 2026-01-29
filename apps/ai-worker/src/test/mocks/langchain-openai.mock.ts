/**
 * Mock implementations for @langchain/openai
 *
 * Usage in tests:
 * ```typescript
 * vi.mock('@langchain/openai', () => require('./test/mocks/langchain-openai.mock'));
 * ```
 */

import { vi } from 'vitest';

/**
 * Default scoring response for lead scoring tests
 */
export const DEFAULT_SCORING_RESPONSE = {
  score: 75,
  confidence: 0.85,
  factors: [
    {
      name: 'Contact Completeness',
      impact: 20,
      reasoning: 'Complete contact information with corporate email domain indicates a professional lead.',
    },
    {
      name: 'Engagement Quality',
      impact: 15,
      reasoning: 'Website source suggests active interest in the product.',
    },
    {
      name: 'Qualification Signals',
      impact: 25,
      reasoning: 'VP-level title indicates decision-making authority within the organization.',
    },
    {
      name: 'Data Quality',
      impact: 15,
      reasoning: 'All required fields present with consistent formatting.',
    },
  ],
};

/**
 * Default sentiment response for sentiment analysis tests
 */
export const DEFAULT_SENTIMENT_RESPONSE = {
  sentiment: 'positive',
  confidence: 0.82,
  aspects: [
    { aspect: 'product', sentiment: 'positive', score: 0.85 },
    { aspect: 'support', sentiment: 'neutral', score: 0.5 },
  ],
};

/**
 * Default embedding response (1536 dimensions for text-embedding-ada-002)
 */
export const DEFAULT_EMBEDDING_RESPONSE = {
  embedding: Array(1536).fill(0).map((_, i) => Math.sin(i / 100)),
};

/**
 * Create a mock ChatOpenAI instance with customizable response
 */
export function createMockChatOpenAI(response: unknown = DEFAULT_SCORING_RESPONSE) {
  const MockChatOpenAI = function (this: Record<string, unknown>) {
    this.invoke = vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
    });
    this.stream = vi.fn().mockImplementation(async function* () {
      yield { content: JSON.stringify(response) };
    });
    this.bind = vi.fn().mockReturnThis();
    this.pipe = vi.fn().mockReturnThis();
  };
  return MockChatOpenAI;
}

/**
 * Create a mock OpenAIEmbeddings instance
 */
export function createMockOpenAIEmbeddings(embedding: number[] = DEFAULT_EMBEDDING_RESPONSE.embedding) {
  const MockOpenAIEmbeddings = function (this: Record<string, unknown>) {
    this.embedQuery = vi.fn().mockResolvedValue(embedding);
    this.embedDocuments = vi.fn().mockImplementation(async (docs: string[]) => {
      return docs.map(() => embedding);
    });
  };
  return MockOpenAIEmbeddings;
}

/**
 * Default export for vi.mock('@langchain/openai', () => require(...))
 */
export const ChatOpenAI = createMockChatOpenAI();
export const OpenAIEmbeddings = createMockOpenAIEmbeddings();
