/**
 * TokenUsageCallbackHandler unit tests (IFC-215)
 *
 * Verifies that the LangChain callback handler correctly captures
 * token usage from llmOutput and exposes it via getUsage().
 */

import { describe, it, expect } from 'vitest';
import { TokenUsageCallbackHandler } from '../scoring.chain';
import type { LLMResult } from '@langchain/core/outputs';

function makeOutput(tokenUsage?: { promptTokens?: number; completionTokens?: number }): LLMResult {
  return {
    generations: [],
    llmOutput: tokenUsage !== undefined ? { tokenUsage } : undefined,
  };
}

describe('TokenUsageCallbackHandler (IFC-215)', () => {
  it('returns null before any LLM call completes', () => {
    const handler = new TokenUsageCallbackHandler('test-model');
    expect(handler.getUsage()).toBeNull();
  });

  it('captures promptTokens and completionTokens from llmOutput', () => {
    const handler = new TokenUsageCallbackHandler('test-model');
    handler.handleLLMEnd(makeOutput({ promptTokens: 120, completionTokens: 60 }));
    const usage = handler.getUsage();
    expect(usage).not.toBeNull();
    expect(usage?.inputTokens).toBe(120);
    expect(usage?.outputTokens).toBe(60);
    expect(usage?.model).toBe('test-model');
  });

  it('defaults to 0 when promptTokens or completionTokens are missing', () => {
    const handler = new TokenUsageCallbackHandler('test-model');
    handler.handleLLMEnd(makeOutput({}));
    const usage = handler.getUsage();
    expect(usage?.inputTokens).toBe(0);
    expect(usage?.outputTokens).toBe(0);
  });

  it('does not overwrite captured usage when llmOutput is absent', () => {
    const handler = new TokenUsageCallbackHandler('test-model');
    handler.handleLLMEnd(makeOutput({ promptTokens: 50, completionTokens: 25 }));
    handler.handleLLMEnd(makeOutput(undefined)); // llmOutput absent — should not overwrite
    const usage = handler.getUsage();
    expect(usage?.inputTokens).toBe(50);
    expect(usage?.outputTokens).toBe(25);
  });

  it('captures estimatedTokenUsage when tokenUsage is absent (streaming/Responses API path)', () => {
    const handler = new TokenUsageCallbackHandler('test-model');
    handler.handleLLMEnd({
      generations: [],
      llmOutput: {
        estimatedTokenUsage: { promptTokens: 80, completionTokens: 40 },
      },
    });
    const usage = handler.getUsage();
    expect(usage?.inputTokens).toBe(80);
    expect(usage?.outputTokens).toBe(40);
  });
});
