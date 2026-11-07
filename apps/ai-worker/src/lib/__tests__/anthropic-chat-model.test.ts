/**
 * AnthropicChatModel against a stubbed Messages client. No test makes a real Claude call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { leadScoreSchema } from '@intelliflow/validators';

const { logInfo, recordModelUsage } = vi.hoisted(() => ({
  logInfo: vi.fn(),
  recordModelUsage: vi.fn(),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: logInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../usage-metering.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../usage-metering')>()),
  recordModelUsage,
  assertWithinDailyLimit: vi.fn(),
}));

import {
  AnthropicChatModel,
  AnthropicIncompleteResponseError,
  toAnthropicMessages,
} from '../anthropic-chat-model';
import { isRetryableModelError } from '../llm-factory';
import { wrapModelWithTracing } from '../../tracing/llm-tracer';
import {
  _resetPendingSpend,
  MonthlyBudgetExceededError,
  monthlyBudgetKey,
  setMonthlyBudgetStore,
} from '../monthly-budget';

const SCORE = {
  score: 72,
  confidence: 0.8,
  factors: [{ name: 'Title', impact: 20, reasoning: 'A VP title signals authority.' }],
  modelVersion: 'm',
};

type Reply = Record<string, unknown>;

function reply(text: string, overrides: Reply = {}): Reply {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_details: null,
    usage: {
      input_tokens: 120,
      output_tokens: 45,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

function modelWith(create: (...args: unknown[]) => unknown) {
  const stub = vi.fn(create);
  const model = new AnthropicChatModel({
    model: 'claude-haiku-5-5',
    maxTokens: 8000,
    timeout: 30_000,
    effort: 'low',
    client: { messages: { create: stub } } as never,
  });
  return { model, create: stub };
}

function sentParams(create: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return create.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  logInfo.mockClear();
  recordModelUsage.mockClear();
  _resetPendingSpend();
});

describe('metering through the tracing wrapper', () => {
  const meta = {
    purpose: 'scoring' as const,
    tier: 'free' as const,
    pricingKey: 'claude-haiku-5-5',
  };

  it('meters a refused call: Anthropic bills its tokens, so spend limits must count them', async () => {
    const { model } = modelWith(async () =>
      reply('', {
        stop_reason: 'refusal',
        content: [],
        usage: { input_tokens: 400, output_tokens: 8000 },
      })
    );
    const traced = wrapModelWithTracing(model, meta) as unknown as AnthropicChatModel;

    await expect(traced.withStructuredOutput(leadScoreSchema).invoke('x')).rejects.toBeInstanceOf(
      AnthropicIncompleteResponseError
    );
    expect(recordModelUsage).toHaveBeenCalledTimes(1);
    expect(recordModelUsage.mock.calls[0][2]).toMatchObject({
      usage_metadata: { input_tokens: 400, output_tokens: 8000 },
      response_metadata: { model_name: 'claude-haiku-5-5', stop_reason: 'refusal' },
    });
  });

  it('meters a structured call once when it succeeds', async () => {
    const { model } = modelWith(async () => reply(JSON.stringify(SCORE)));
    const traced = wrapModelWithTracing(model, meta) as unknown as AnthropicChatModel;
    await traced.withStructuredOutput(leadScoreSchema).invoke('x');
    expect(recordModelUsage).toHaveBeenCalledTimes(1);
    expect(recordModelUsage.mock.calls[0][2].usage_metadata).toMatchObject({
      input_tokens: 120,
      output_tokens: 45,
    });
  });

  it('refuses before calling Claude once the monthly budget is used, and adds billed calls to it', async () => {
    const totals = new Map<string, number>();
    setMonthlyBudgetStore({
      get: async (key) => (totals.has(key) ? String(totals.get(key)) : null),
      incrby: async (key, by) => {
        totals.set(key, (totals.get(key) ?? 0) + by);
        return totals.get(key)!;
      },
      expire: async () => 1,
    });
    try {
      const { model, create } = modelWith(async () => reply('ok'));
      const traced = wrapModelWithTracing(model, meta) as unknown as AnthropicChatModel;

      await traced.invoke('x');
      // 120 in x $0.10/M + 45 out x $0.50/M, in micro-dollars.
      expect(totals.get(monthlyBudgetKey())).toBe(35);

      totals.set(monthlyBudgetKey(), 60_000_000);
      await expect(traced.invoke('x')).rejects.toBeInstanceOf(MonthlyBudgetExceededError);
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      setMonthlyBudgetStore(null);
    }
  });

  it('refuses a Claude model when the budget store is missing, whatever the global provider', async () => {
    const { model, create } = modelWith(async () => reply('ok'));
    const traced = wrapModelWithTracing(model, {
      ...meta,
      provider: 'anthropic',
    }) as unknown as AnthropicChatModel;
    await expect(traced.invoke('x')).rejects.toBeInstanceOf(MonthlyBudgetExceededError);
    expect(create).not.toHaveBeenCalled();
  });

  it('meters nothing for an API error, which is not billed', async () => {
    const { model } = modelWith(async () => {
      throw Anthropic.APIError.generate(429, undefined, 'Too many requests', new Headers());
    });
    const traced = wrapModelWithTracing(model, meta) as unknown as AnthropicChatModel;
    await expect(traced.invoke('x')).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    expect(recordModelUsage).not.toHaveBeenCalled();
  });
});

describe('AnthropicChatModel', () => {
  it('sends no sampling parameters, and sends the effort and the system prompt apart', async () => {
    const { model, create } = modelWith(async () => reply('ok'));
    await model.invoke([new SystemMessage('Be brief.'), new HumanMessage('Hello')]);

    const params = sentParams(create);
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');
    expect(params).not.toHaveProperty('top_k');
    expect(params).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 8000,
      system: 'Be brief.',
      messages: [{ role: 'user', content: 'Hello' }],
      output_config: { effort: 'low' },
    });
  });

  it('asks for structured output through output_config.format and parses with the schema', async () => {
    const { model, create } = modelWith(async () => reply(JSON.stringify(SCORE)));
    const result = await model.withStructuredOutput(leadScoreSchema).invoke('Score this lead');

    expect(result).toEqual(SCORE);
    const format = (sentParams(create).output_config as { format: Record<string, unknown> }).format;
    expect(format.type).toBe('json_schema');
    const props = (format.schema as { properties: Record<string, Record<string, unknown>> })
      .properties;
    // #1218: the model is told to give at least one factor.
    expect(props.factors.minItems).toBe(1);
    expect(String(props.confidence.description)).toMatch(/never 0/i);
  });

  it('keeps a lenient schema lenient, so the scoring chain can report a placeholder as inconclusive', async () => {
    const placeholder = { score: 0, confidence: 0, factors: [], modelVersion: 'm' };
    const { model } = modelWith(async () => reply(JSON.stringify(placeholder)));
    await expect(model.withStructuredOutput(leadScoreSchema).invoke('x')).resolves.toEqual(
      placeholder
    );
  });

  it('rejects an answer that does not match the schema instead of returning it', async () => {
    const { model } = modelWith(async () => reply(JSON.stringify({ score: 'high' })));
    await expect(model.withStructuredOutput(leadScoreSchema).invoke('x')).rejects.toThrow();
  });

  it('reads text blocks by type, past thinking blocks', async () => {
    const { model } = modelWith(async () =>
      reply('', {
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: 'the answer' },
        ],
      })
    );
    const message = await model.invoke('q');
    expect(message.content).toBe('the answer');
  });

  it('reports input and output tokens to callbacks, usage metadata and the log', async () => {
    const { model } = modelWith(async () => reply(JSON.stringify(SCORE)));
    const handleLLMEnd = vi.fn();
    await model
      .withStructuredOutput(leadScoreSchema)
      .invoke('x', { callbacks: [{ handleLLMEnd }] });

    const output = handleLLMEnd.mock.calls[0][0];
    expect(output.llmOutput.tokenUsage).toEqual({
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 165,
    });
    expect(output.generations[0][0].message.response_metadata.model_name).toBe('claude-haiku-5-5');
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-5-5', inputTokens: 120, outputTokens: 45 }),
      'Claude call'
    );

    const plain = await model.invoke('y');
    expect(plain.usage_metadata).toMatchObject({ input_tokens: 120, output_tokens: 45 });
  });

  it('throws on a refusal instead of returning an empty answer', async () => {
    const { model } = modelWith(async () =>
      reply('', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' } })
    );
    const call = model.withStructuredOutput(leadScoreSchema).invoke('x');
    await expect(call).rejects.toBeInstanceOf(AnthropicIncompleteResponseError);
    await expect(call).rejects.toThrow(/refusal.*cyber/);
  });

  it.each(['max_tokens', 'model_context_window_exceeded', 'pause_turn', 'tool_use', null])(
    'throws on stop_reason %s: only a finished answer is usable',
    async (stopReason) => {
      const { model } = modelWith(async () => reply('{"score":', { stop_reason: stopReason }));
      await expect(model.invoke('x')).rejects.toBeInstanceOf(AnthropicIncompleteResponseError);
    }
  );

  it('accepts an answer that ended on a stop sequence', async () => {
    const { model } = modelWith(async () => reply('done', { stop_reason: 'stop_sequence' }));
    await expect(model.invoke('x')).resolves.toMatchObject({ content: 'done' });
  });

  it('lets a rate limit through as an error another model may fix', async () => {
    const limited = Anthropic.APIError.generate(
      429,
      { type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests' } },
      'Too many requests',
      new Headers()
    );
    const { model } = modelWith(async () => {
      throw limited;
    });
    const call = model.withStructuredOutput(leadScoreSchema).invoke('x');
    await expect(call).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    expect(isRetryableModelError(limited)).toBe(true);
  });

  it('lets a spend-limit refusal through as an error, not a result', async () => {
    const spent = Anthropic.APIError.generate(
      400,
      {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Your credit balance is too low' },
      },
      'Your credit balance is too low',
      new Headers()
    );
    const { model } = modelWith(async () => {
      throw spent;
    });
    await expect(model.withStructuredOutput(leadScoreSchema).invoke('x')).rejects.toBe(spent);
    expect(isRetryableModelError(spent)).toBe(false);
  });
});

describe('toAnthropicMessages', () => {
  it('joins system messages and maps the other roles', () => {
    expect(
      toAnthropicMessages([
        new SystemMessage('a'),
        new SystemMessage('b'),
        new HumanMessage({ content: [{ type: 'text', text: 'hi' }] }),
      ])
    ).toEqual({ system: 'a\n\nb', messages: [{ role: 'user', content: 'hi' }] });
  });
});
