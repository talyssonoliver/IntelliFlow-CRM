/**
 * OpenRouter structured calls stay metered, and an OpenRouter fallback stays free.
 *
 * The factory patches `withStructuredOutput` on the OpenRouter model (tool calling by
 * default). The tracer meters structured calls by wrapping the clones `withConfig`
 * returns, so this drives the real factory + real tracer + real ChatOpenAI with a fake
 * fetch: one structured call must record exactly one usage. When OpenRouter answers from
 * the fallback model (the `model` it reports), the call must still price at $0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('OpenRouter metering through the factory', () => {
  const recordUsage = vi.fn();
  const assertWithinDailyLimit = vi.fn();

  function completion(servedModel: string): Response {
    return Response.json({
      id: 'gen-1',
      object: 'chat.completion',
      created: 0,
      model: servedModel,
      choices: [
        {
          index: 0,
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'extract', arguments: '{"score":60}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 6, total_tokens: 46 },
    });
  }

  async function load(servedModel: string) {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completion(servedModel))
    );
    vi.doMock('../../utils/cost-tracker', () => ({
      costTracker: { recordUsage, assertWithinDailyLimit },
    }));
    vi.doMock('../purpose-ceiling.js', () => ({ assertWithinCeiling: vi.fn() }));
    vi.doMock('../tenant-ai-config.js', () => ({ resolveEffectiveTier: vi.fn() }));
    vi.doMock('../../config/ai.config.js', async () => ({
      ...(await vi.importActual<Record<string, unknown>>('../../config/ai.config.js')),
      aiConfig: { provider: 'openrouter', costTracking: { enabled: true } },
    }));
    const factory = await import('../llm-factory.js');
    const { calculateCost } = await import('../../config/ai.config.js');
    return { ...factory, calculateCost };
  }

  beforeEach(() => {
    recordUsage.mockReset();
    assertWithinDailyLimit.mockReset();
    vi.stubEnv('OPENROUTER_API_KEY', ['or', 'test', 'placeholder'].join('-'));
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.example.invalid/api/v1');
    vi.stubEnv('OPENROUTER_MODEL', '');
    vi.stubEnv('OPENROUTER_MODEL_FREE', '');
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', undefined);
  });

  afterEach(() => {
    vi.doUnmock('../../utils/cost-tracker');
    vi.doUnmock('../purpose-ceiling.js');
    vi.doUnmock('../tenant-ai-config.js');
    vi.doUnmock('../../config/ai.config.js');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ['the primary', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
    ['the fallback', 'nvidia/nemotron-3.5-lightning:free'],
    ['the fallback, reported without :free', 'nvidia/nemotron-3.5-lightning'],
  ])('meters one structured call answered by %s, priced at $0', async (_label, served) => {
    const { createLLM, calculateCost } = await load(served);
    const { z } = await import('zod');

    const result = await createLLM('scoring', 'free')
      .withStructuredOutput(z.object({ score: z.number() }))
      .invoke('score this lead');

    expect(result).toEqual({ score: 60 });
    expect(recordUsage).toHaveBeenCalledTimes(1);
    const usage = recordUsage.mock.calls[0][0] as { model: string; inputTokens: number };
    expect(usage.inputTokens).toBe(40);
    expect(calculateCost(usage.model, 40, 6)).toBe(0);
  });
});
