/**
 * usage-metering.test.ts — PG-199 (ADR-082): every chat and embedding call made through the
 * tracing wrappers is metered exactly once (cost, purpose, pinned model), and embeddings check
 * the rag ceiling first. Lives under lib/__tests__ because src/tracing/__tests__ is excluded
 * from the package suite (OTel global-state isolation, vitest.config.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PG-199: metering — exactly one usage record per chat / embedding call
// ---------------------------------------------------------------------------

describe('PG-199 metering in the tracing wrappers', () => {
  const recordUsage = vi.fn();
  const assertWithinCeiling = vi.fn();
  const resolveEffectiveTier = vi.fn();

  async function load(costTrackingEnabled = true) {
    vi.resetModules();
    vi.doMock('../../utils/cost-tracker', () => ({ costTracker: { recordUsage } }));
    vi.doMock('../purpose-ceiling.js', () => ({ assertWithinCeiling }));
    vi.doMock('../tenant-ai-config.js', () => ({ resolveEffectiveTier }));
    vi.doMock('../../config/ai.config.js', async () => ({
      ...(await vi.importActual<Record<string, unknown>>('../../config/ai.config.js')),
      aiConfig: { provider: 'litellm', costTracking: { enabled: costTrackingEnabled } },
    }));
    const tracerMod = await import('../../tracing/llm-tracer.js');
    const { tenantContextStore } = await import('../../tracing/tenant-context.js');
    return { ...tracerMod, tenantContextStore };
  }

  function chatModel(result: unknown) {
    return { invoke: vi.fn().mockResolvedValue(result) } as never;
  }

  beforeEach(() => {
    recordUsage.mockReset();
    assertWithinCeiling.mockReset().mockResolvedValue(undefined);
    resolveEffectiveTier.mockReset().mockResolvedValue({ tier: 'free', ceilingCents: 100 });
  });

  afterEach(() => {
    vi.doUnmock('../../utils/cost-tracker');
    vi.doUnmock('../purpose-ceiling.js');
    vi.doUnmock('../tenant-ai-config.js');
    vi.doUnmock('../../config/ai.config.js');
  });

  it('records one usage per chat call with provider token counts, purpose and alias pricing', async () => {
    const { wrapModelWithTracing, tenantContextStore } = await load();
    const model = wrapModelWithTracing(
      chatModel({ content: 'ok', usage_metadata: { input_tokens: 120, output_tokens: 30 } }),
      { purpose: 'scoring', tier: 'standard' }
    );

    await tenantContextStore.run({ tenantId: 't1' } as never, () => model.invoke('score'));

    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith({
      model: 'scoring-standard',
      inputTokens: 120,
      outputTokens: 30,
      operationType: 'llm:scoring',
      metadata: { purpose: 'scoring', tier: 'standard', modelId: null },
    });
  });

  it('prices with an explicit provider pricing key when the factory gives one', async () => {
    const { wrapModelWithTracing } = await load();
    const model = wrapModelWithTracing(
      chatModel({ content: 'ok', usage_metadata: { input_tokens: 10, output_tokens: 5 } }),
      { purpose: 'qualification', tier: 'free', pricingKey: 'openai/gpt-oss-120b:free' }
    );

    await model.invoke('x');

    expect(recordUsage.mock.calls[0][0]).toMatchObject({ model: 'openai/gpt-oss-120b:free' });
  });

  it('prices from the model the gateway reports serving (a paid gateway fallback)', async () => {
    const { wrapModelWithTracing } = await load();
    const model = wrapModelWithTracing(
      chatModel({
        content: 'ok',
        usage_metadata: { input_tokens: 10, output_tokens: 5 },
        // LiteLLM fell back from reasoning-free (free) to reasoning-standard (paid).
        response_metadata: { model_name: 'claude-haiku-4-5-20251001' },
      }),
      { purpose: 'reasoning', tier: 'free' }
    );

    await model.invoke('x');

    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      model: 'reasoning-standard',
      operationType: 'llm:reasoning',
    });
  });

  it('keeps the construction pricing when the served model is unknown', async () => {
    const { wrapModelWithTracing } = await load();
    const model = wrapModelWithTracing(
      chatModel({ content: 'ok', response_metadata: { model_name: 'mistral' } }),
      { purpose: 'qualification', tier: 'free', pricingKey: 'ollama' }
    );

    await model.invoke('x');

    expect(recordUsage.mock.calls[0][0]).toMatchObject({ model: 'ollama' });
  });

  it('prices a pinned model with its catalog pricing key', async () => {
    const { wrapModelWithTracing } = await load();
    const model = wrapModelWithTracing(
      chatModel({ content: 'ok', usage_metadata: { input_tokens: 10, output_tokens: 5 } }),
      { purpose: 'scoring', tier: 'free', modelId: 'gpt-4o-mini' }
    );

    await model.invoke('x');

    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      model: 'gpt-4o-mini',
      metadata: { purpose: 'scoring', modelId: 'gpt-4o-mini' },
    });
  });

  it('estimates tokens when the provider returns no usage (never records 0/0)', async () => {
    const { wrapModelWithTracing } = await load();
    const model = wrapModelWithTracing(chatModel({ content: 'a reasonably long answer here' }), {
      purpose: 'reasoning',
      tier: 'free',
    });

    await model.invoke('please think about this question');

    const usage = recordUsage.mock.calls[0][0];
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it('estimates tokens from message lists, text parts and other shapes', async () => {
    const { wrapModelWithTracing } = await load();
    const shapes: { input: unknown; output: unknown }[] = [
      // chat messages with string and multi-part content
      {
        input: [{ content: 'system rules' }, { content: [{ text: 'part one' }, 'part two'] }],
        output: { content: [{ text: 'structured answer' }] },
      },
      // a prompt value with toString, and a value object
      { input: { toString: () => 'prompt value text' }, output: { value: 'value text' } },
      // a plain object (JSON fallback), a number, and null output
      { input: { question: 'what next?' }, output: 42 },
      { input: 'ask', output: null },
    ];
    for (const { input, output } of shapes) {
      recordUsage.mockClear();
      const model = wrapModelWithTracing(chatModel(output), { purpose: 'email', tier: 'free' });
      await model.invoke(input as never);
      const usage = recordUsage.mock.calls[0][0];
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.outputTokens).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns the answer even when metering throws (e.g. the daily cost limit)', async () => {
    const { wrapModelWithTracing } = await load();
    recordUsage.mockImplementationOnce(() => {
      throw new Error('Daily AI cost limit exceeded: $51.00 / $50.00');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const model = wrapModelWithTracing(
      chatModel({ content: 'paid answer', usage_metadata: { input_tokens: 1, output_tokens: 1 } }),
      { purpose: 'email', tier: 'free' }
    );

    await expect(model.invoke('x')).resolves.toMatchObject({ content: 'paid answer' });
    expect(warn.mock.calls.some((c) => String(c[0]).includes('usage_not_metered'))).toBe(true);
    warn.mockRestore();
  });

  it('records nothing when cost tracking is disabled', async () => {
    const { wrapModelWithTracing } = await load(false);
    const model = wrapModelWithTracing(chatModel({ content: 'ok' }), {
      purpose: 'email',
      tier: 'free',
    });
    await model.invoke('x');
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('records nothing for a failed call', async () => {
    const { wrapModelWithTracing } = await load();
    const failing = { invoke: vi.fn().mockRejectedValue(new Error('429')) } as never;
    const model = wrapModelWithTracing(failing, { purpose: 'email', tier: 'free' });
    await expect(model.invoke('x')).rejects.toThrow('429');
    expect(recordUsage).not.toHaveBeenCalled();
  });

  describe('structured output and bound models (real ChatOpenAI)', () => {
    // ChatOpenAI.withConfig / withStructuredOutput / bindTools return a NEW ChatOpenAI built
    // from the same fields, so a wrapper that only patched the original instance never saw
    // structured calls. Driven through the real class with a fake fetch, no network.
    async function realModel() {
      const { ChatOpenAI } = await import('@langchain/openai');
      const fetch = vi.fn(async () =>
        Response.json({
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 0,
          model: 'scoring-free',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: '{"score":7}' },
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 6, total_tokens: 46 },
        })
      );
      const model = new ChatOpenAI({
        apiKey: 'placeholder-key',
        model: 'scoring-free',
        maxRetries: 0,
        configuration: { baseURL: 'http://llm.example.invalid/v1', fetch },
      });
      return { model, fetch };
    }

    it('meters a withStructuredOutput call exactly once with the provider usage', async () => {
      const { wrapModelWithTracing } = await load();
      const { z } = await import('zod');
      const { model, fetch } = await realModel();
      const traced = wrapModelWithTracing(model as never, { purpose: 'scoring', tier: 'free' });

      const result = await traced
        .withStructuredOutput(z.object({ score: z.number() }), { method: 'jsonMode' })
        .invoke('score this lead as JSON');

      expect(result).toEqual({ score: 7 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(recordUsage).toHaveBeenCalledTimes(1);
      expect(recordUsage.mock.calls[0][0]).toMatchObject({
        model: 'scoring-free',
        inputTokens: 40,
        outputTokens: 6,
        operationType: 'llm:scoring',
      });
    });

    it('meters a model bound with withConfig, and still meters the original once', async () => {
      const { wrapModelWithTracing } = await load();
      const { model } = await realModel();
      const traced = wrapModelWithTracing(model as never, { purpose: 'email', tier: 'free' });

      await traced.withConfig({ tags: ['draft'] }).invoke('hi');
      await traced.invoke('hi');

      expect(recordUsage).toHaveBeenCalledTimes(2);
      expect(recordUsage.mock.calls.map((c) => c[0].operationType)).toEqual([
        'llm:email',
        'llm:email',
      ]);
    });

    it('does not re-wrap a binding that delegates to the wrapped model (no double count)', async () => {
      const { wrapModelWithTracing } = await load();
      type Invokable = { invoke: (input: unknown) => Promise<unknown> };
      class Binding {
        constructor(private readonly bound: Invokable) {}
        invoke(input: unknown) {
          return this.bound.invoke(input);
        }
      }
      const base = {
        invoke: vi.fn().mockResolvedValue({ content: 'ok' }),
        withConfig(this: Invokable) {
          return new Binding(this);
        },
      };
      const traced = wrapModelWithTracing(base as never, { purpose: 'email', tier: 'free' });

      await traced.withConfig({ tags: ['x'] }).invoke('hi');

      expect(recordUsage).toHaveBeenCalledTimes(1);
    });
  });

  describe('embeddings (owner Q8: rag is metered and capped)', () => {
    function embeddings() {
      return {
        embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]),
        embedDocuments: vi.fn().mockResolvedValue([[0.1], [0.2]]),
      } as never;
    }

    it('checks the rag ceiling before the call and records one estimated usage', async () => {
      const { wrapEmbeddingsWithTracing, tenantContextStore } = await load();
      const stub = embeddings() as { embedQuery: ReturnType<typeof vi.fn> };
      const original = stub.embedQuery; // the wrapper replaces the method in place
      const wrapped = wrapEmbeddingsWithTracing(stub as never, {
        tier: 'free',
        pricingKey: 'gemini-embedding-001',
      });

      await tenantContextStore.run({ tenantId: 't9' } as never, () =>
        wrapped.embedQuery('some text to embed')
      );

      expect(resolveEffectiveTier).toHaveBeenCalledWith('t9', 'rag', 'free');
      expect(assertWithinCeiling).toHaveBeenCalledWith('t9', 'rag', 100);
      expect(assertWithinCeiling.mock.invocationCallOrder[0]).toBeLessThan(
        original.mock.invocationCallOrder[0]
      );
      expect(recordUsage).toHaveBeenCalledTimes(1);
      expect(recordUsage.mock.calls[0][0]).toMatchObject({
        model: 'gemini-embedding-001',
        outputTokens: 0,
        operationType: 'llm:rag',
        metadata: { purpose: 'rag', tier: 'free' },
      });
      expect(recordUsage.mock.calls[0][0].inputTokens).toBeGreaterThan(0);
    });

    it('meters embedDocuments once for the whole batch', async () => {
      const { wrapEmbeddingsWithTracing, tenantContextStore } = await load();
      const wrapped = wrapEmbeddingsWithTracing(embeddings(), { tier: 'premium' });

      await tenantContextStore.run({ tenantId: 't9' } as never, () =>
        wrapped.embedDocuments(['one', 'two'])
      );

      expect(recordUsage).toHaveBeenCalledTimes(1);
      expect(recordUsage.mock.calls[0][0].model).toBe('rag-premium');
    });

    it('does not call the provider when the rag ceiling is reached', async () => {
      const { wrapEmbeddingsWithTracing, tenantContextStore } = await load();
      const stub = embeddings() as { embedQuery: ReturnType<typeof vi.fn> };
      const original = stub.embedQuery;
      assertWithinCeiling.mockRejectedValue(
        Object.assign(new Error('monthly AI ceiling reached for rag'), {
          code: 'PURPOSE_CEILING_REACHED',
        })
      );
      const wrapped = wrapEmbeddingsWithTracing(stub as never, { tier: 'free' });

      await expect(
        tenantContextStore.run({ tenantId: 't9' } as never, () => wrapped.embedQuery('x'))
      ).rejects.toMatchObject({ code: 'PURPOSE_CEILING_REACHED' });
      expect(original).not.toHaveBeenCalled();
      expect(recordUsage).not.toHaveBeenCalled();
    });

    it('neither meters nor checks a ceiling without a tenant (shared boot-time chain)', async () => {
      const { wrapEmbeddingsWithTracing } = await load();
      const wrapped = wrapEmbeddingsWithTracing(embeddings(), { tier: 'free' });

      await expect(wrapped.embedQuery('x')).resolves.toEqual([0.1, 0.2]);
      expect(assertWithinCeiling).not.toHaveBeenCalled();
      expect(recordUsage).not.toHaveBeenCalled();
    });
  });
});
