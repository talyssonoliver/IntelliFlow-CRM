/**
 * The lead-scoring chain on AI_PROVIDER=anthropic: the real chain and the real
 * AnthropicChatModel, with only the Messages client stubbed. No real Claude call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../../versioning/chain-version-loader', () => ({
  getVersionLoader: vi.fn(() => ({
    getChainConfig: vi.fn().mockRejectedValue(new Error('No active version')),
  })),
  CHAIN_TYPE_MAP: { LEAD_SCORING: 'SCORING' },
  configureVersionLoader: vi.fn(),
}));

vi.mock('../../lib/llm-factory.js', async () => {
  const { AnthropicChatModel } = await import('../../lib/anthropic-chat-model');
  const build = () =>
    new AnthropicChatModel({
      model: 'claude-haiku-5-5',
      maxTokens: 8000,
      timeout: 30_000,
      effort: 'low',
      client: { messages: { create } } as never,
    });
  return {
    createLLM: vi.fn(build),
    createLLMForTenant: vi.fn(async () => build()),
    getLLMBreaker: vi.fn(() => ({ execute: vi.fn(async (fn: () => unknown) => fn()) })),
    __resetBreakers: vi.fn(),
  };
});

vi.mock('../../config/ai.config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/ai.config')>();
  return {
    ...actual,
    aiConfig: {
      ...actual.aiConfig,
      provider: 'anthropic',
      costTracking: { enabled: false, warningThreshold: 10 },
      features: { ...actual.aiConfig.features, enableChainLogging: false },
    },
  };
});

import { LeadScoringChain } from '../scoring.chain';

const LEAD = {
  email: 'pat@northwind.example.invalid',
  title: 'VP of Operations',
  source: 'WEBSITE',
};

function answer(body: unknown, stop = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: JSON.stringify(body) }],
    stop_reason: stop,
    stop_details: null,
    usage: { input_tokens: 400, output_tokens: 90 },
  };
}

beforeEach(() => create.mockReset());

describe('LeadScoringChain on Claude', () => {
  it('scores a lead from a structured answer and books the call as Claude', async () => {
    create.mockResolvedValue(
      answer({
        score: 81,
        confidence: 0.9,
        factors: [{ name: 'Title', impact: 25, reasoning: 'A VP title signals authority.' }],
        modelVersion: 'ignored',
      })
    );

    const result = await new LeadScoringChain().scoreLead(LEAD as never);

    expect(result).toMatchObject({ score: 81, confidence: 0.9 });
    expect(result.modelVersion).toMatch(/^anthropic:/);
    const params = create.mock.calls[0][0];
    expect(params).not.toHaveProperty('temperature');
    expect(params.output_config.format.schema.properties.factors.minItems).toBe(1);
  });

  it('reports a placeholder answer as inconclusive, never as a score of 0 (#1218)', async () => {
    create.mockResolvedValue(
      answer({ score: 0, confidence: 0, factors: [], modelVersion: 'ignored' })
    );
    await expect(new LeadScoringChain().scoreLead(LEAD as never)).rejects.toMatchObject({
      name: 'ScoringInconclusiveError',
    });
  });

  it('fails on a refusal instead of scoring', async () => {
    create.mockResolvedValue({ ...answer({}), stop_reason: 'refusal', content: [] });
    await expect(new LeadScoringChain().scoreLead(LEAD as never)).rejects.toMatchObject({
      name: 'AnthropicIncompleteResponseError',
    });
  });
});
