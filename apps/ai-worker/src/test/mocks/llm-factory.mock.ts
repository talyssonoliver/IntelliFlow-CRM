/**
 * Mock factory for apps/ai-worker/src/lib/llm-factory.ts
 *
 * Preferred mock seam for chain/agent tests — mocks the factory instead of the
 * underlying @langchain/openai or @langchain/ollama class so tests survive future
 * provider swaps without change.
 *
 * Usage (Pattern A):
 * ```typescript
 * vi.mock('../../lib/llm-factory.js', () => createMockLLMFactory({ scoring: myParsedObj }));
 * ```
 *
 * Or inline:
 * ```typescript
 * vi.mock('../../lib/llm-factory.js', () => ({
 *   createLLM: vi.fn(() => ({
 *     invoke: vi.fn().mockResolvedValue({ content: '...' }),
 *     withStructuredOutput: vi.fn(() => ({
 *       invoke: vi.fn().mockResolvedValue(parsedObj),
 *     })),
 *   })),
 *   createEmbeddings: vi.fn(() => ({
 *     embedQuery: vi.fn().mockResolvedValue([]),
 *     embedDocuments: vi.fn().mockResolvedValue([]),
 *   })),
 * }));
 * ```
 *
 * H9: Includes `getLLMBreaker` (returns a pass-through CLOSED breaker) and
 * `__resetBreakers` (no-op in mocks). Call `__resetBreakers()` in `beforeEach`
 * to prevent circuit breaker state leaks across tests.
 */

import { vi } from 'vitest';

// ============================================================================
// Stub CircuitBreaker (H9) — always CLOSED, never trips in tests
// ============================================================================

class _StubCircuitBreaker {
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  getState() {
    return { state: 'CLOSED' as const, failureCount: 0, lastFailureTime: 0 };
  }
  reset() {}
}

/** Shared stub instance returned by getLLMBreaker in tests. */
const _stubBreaker = new _StubCircuitBreaker();

/** Per-purpose override responses. Omitted purposes fall back to defaults. */
export interface MockLLMFactoryOptions {
  /** Parsed object returned by structuredModel.invoke() for 'scoring' purpose */
  scoring?: unknown;
  /** Parsed object returned by structuredModel.invoke() for 'qualification' purpose */
  qualification?: unknown;
  /** String or parsed object returned by model.invoke() for 'email' purpose */
  email?: unknown;
  /** Parsed object returned by structuredModel.invoke() for 'reasoning' purpose */
  reasoning?: unknown;
  /** Parsed object returned by structuredModel.invoke() for 'structured' purpose */
  structured?: unknown;
  /** Parsed object returned by structuredModel.invoke() for 'rag' purpose */
  rag?: unknown;
}

const DEFAULT_SCORING_PARSED = {
  score: 75,
  confidence: 0.85,
  factors: [
    {
      name: 'Contact Completeness',
      impact: 20,
      reasoning: 'Complete contact information with corporate email domain.',
    },
    {
      name: 'Engagement Quality',
      impact: 15,
      reasoning: 'Website source suggests active interest in the product.',
    },
    {
      name: 'Qualification Signals',
      impact: 25,
      reasoning: 'VP-level title indicates decision-making authority.',
    },
    {
      name: 'Data Quality',
      impact: 15,
      reasoning: 'All required fields present with consistent formatting.',
    },
  ],
};

const DEFAULT_EMAIL_STRING = JSON.stringify({
  subject: 'Re: Your inquiry',
  body: 'Thank you for reaching out. We would be happy to help.',
  confidence: 0.85,
  tone: 'professional',
  suggestedFollowUp: '3 days',
});

const DEFAULT_EMBEDDING = new Array(1536).fill(0).map((_, i) => Math.sin(i / 100));

/**
 * Build a complete factory mock compatible with:
 *   vi.mock('../../lib/llm-factory.js', () => createMockLLMFactory(opts))
 *
 * Every LLM returned has both `.invoke()` and `.withStructuredOutput()`.
 * - invoke() → returns `{ content: JSON.stringify(response) }` (legacy path)
 * - withStructuredOutput().invoke() → returns the parsed object directly (new path)
 */
export function createMockLLMFactory(opts: MockLLMFactoryOptions = {}) {
  function makeLLMMock(parsedResponse: unknown, rawStringFallback?: string) {
    const asString = rawStringFallback ?? JSON.stringify(parsedResponse);
    return {
      invoke: vi.fn().mockResolvedValue({ content: asString }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { content: asString };
      }),
      bind: vi.fn().mockReturnThis(),
      pipe: vi.fn().mockReturnThis(),
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue(parsedResponse),
      }),
    };
  }

  const scoringMock = makeLLMMock(opts.scoring ?? DEFAULT_SCORING_PARSED);
  const qualificationMock = makeLLMMock(opts.qualification ?? DEFAULT_SCORING_PARSED);
  const emailMock = makeLLMMock(
    opts.email ?? DEFAULT_EMAIL_STRING,
    typeof opts.email === 'string' ? opts.email : DEFAULT_EMAIL_STRING
  );
  const reasoningMock = makeLLMMock(opts.reasoning ?? DEFAULT_SCORING_PARSED);
  const structuredMock = makeLLMMock(opts.structured ?? DEFAULT_SCORING_PARSED);
  const ragMock = makeLLMMock(opts.rag ?? DEFAULT_SCORING_PARSED);

  // Map purpose → mock instance (falls back to scoringMock for unknown purposes)
  const purposeMap: Record<string, ReturnType<typeof makeLLMMock>> = {
    scoring: scoringMock,
    qualification: qualificationMock,
    email: emailMock,
    reasoning: reasoningMock,
    structured: structuredMock,
    rag: ragMock,
  };

  return {
    createLLM: vi.fn((purpose: string) => purposeMap[purpose] ?? scoringMock),
    createEmbeddings: vi.fn(() => ({
      embedQuery: vi.fn().mockResolvedValue(DEFAULT_EMBEDDING),
      embedDocuments: vi
        .fn()
        .mockImplementation(async (docs: string[]) => docs.map(() => DEFAULT_EMBEDDING)),
    })),
    /**
     * H9: Returns a stub breaker that is always CLOSED — no tripping in tests.
     * Call `__resetBreakers()` in beforeEach if you need a fresh state.
     */
    getLLMBreaker: vi.fn(() => _stubBreaker),
    /**
     * H9: No-op in mock context — breaker pool is module-level in llm-factory.ts
     * but the mock replaces the whole module, so no real pool exists.
     */
    __resetBreakers: vi.fn(),
  };
}
