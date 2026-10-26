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

  describe('prices what actually served the call (IFC-117)', () => {
    const served = (modelName: string): LLMResult => ({
      generations: [
        [
          {
            text: '',
            message: { response_metadata: { model_name: modelName } },
          } as unknown as LLMResult['generations'][number][number],
        ],
      ],
      llmOutput: { tokenUsage: { promptTokens: 2000, completionTokens: 500 } },
    });
    const invoke = (handler: TokenUsageCallbackHandler, model: string) =>
      handler.handleChatModelStart({} as never, [], 'run-1', undefined, {
        invocation_params: { model },
      });

    it('marks an OpenRouter :free call as free, keeping the alias as the label', () => {
      const handler = new TokenUsageCallbackHandler('scoring-free', 'openrouter');
      invoke(handler, 'openai/gpt-oss-120b:free');
      handler.handleLLMEnd(served('openai/gpt-oss-120b'));
      expect(handler.getUsage()).toMatchObject({ model: 'scoring-free', free: true });
    });

    it('marks a local Ollama call as free', () => {
      const handler = new TokenUsageCallbackHandler('scoring-free', 'ollama');
      invoke(handler, 'llama3.1');
      handler.handleLLMEnd(served('llama3.1'));
      expect(handler.getUsage()).toMatchObject({ model: 'scoring-free', free: true });
    });

    it('prices a known served model under its own pricing key', () => {
      const handler = new TokenUsageCallbackHandler('scoring-free', 'litellm');
      handler.handleLLMEnd(served('gpt-4o-mini-2024-07-18'));
      expect(handler.getUsage()).toMatchObject({ model: 'scoring-premium', free: false });
    });

    it('keeps the alias when the response names no model', () => {
      const handler = new TokenUsageCallbackHandler('scoring-free', 'litellm');
      handler.handleLLMEnd(makeOutput({ promptTokens: 10, completionTokens: 5 }));
      expect(handler.getUsage()).toMatchObject({ model: 'scoring-free', free: false });
    });

    it('never turns an unknown served name into the model label', () => {
      const handler = new TokenUsageCallbackHandler('scoring-free', 'litellm');
      handler.handleLLMEnd(served('vendor/mystery-model-9000'));
      expect(handler.getUsage()?.model).toBe('scoring-free');
    });
  });
});
