/**
 * AI Service Mocks Index
 *
 * Centralized mock implementations for AI/LLM services.
 * Use these mocks in tests to avoid external API calls.
 *
 * @example
 * ```typescript
 * // In your test file
 * import { createMockChatOpenAI, DEFAULT_SCORING_RESPONSE } from './test/mocks';
 *
 * vi.mock('@langchain/openai', () => ({
 *   ChatOpenAI: createMockChatOpenAI(customResponse)
 * }));
 * ```
 */

// OpenAI/LangChain mocks
export {
  ChatOpenAI,
  OpenAIEmbeddings,
  createMockChatOpenAI,
  createMockOpenAIEmbeddings,
  DEFAULT_SCORING_RESPONSE,
  DEFAULT_SENTIMENT_RESPONSE,
  DEFAULT_EMBEDDING_RESPONSE,
} from './langchain-openai.mock';

// Ollama mocks (local LLM)
export {
  ChatOllama,
  OllamaEmbeddings,
  createMockChatOllama,
  createMockOllamaEmbeddings,
} from './ollama.mock';
