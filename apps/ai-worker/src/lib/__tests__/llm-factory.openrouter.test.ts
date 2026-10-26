/**
 * OpenRouter request shape (production AI outage, 2026-10).
 *
 * Production chat went dark when OpenRouter withdrew `openai/gpt-oss-120b:free` (404 on
 * every call). The free models that replace it (NVIDIA Nemotron) answer tool calls but
 * reject strict `response_format: json_schema` with 404 "No endpoints found that can
 * handle the requested parameters" — the default method of @langchain/openai 1.5.x.
 *
 * These tests use the REAL ChatOpenAI with a fake `fetch`, so they assert the body
 * OpenRouter would receive, not what a mock was told. No network call is made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

vi.mock('@intelliflow/db', () => ({
  prisma: { tenantAIConfig: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

// Tracing is not under test here; keep the model as built.
vi.mock('../../tracing/llm-tracer.js', () => ({
  wrapModelWithTracing: vi.fn((model: unknown) => model),
  wrapEmbeddingsWithTracing: vi.fn((embeddings: unknown) => embeddings),
}));

const PRIMARY = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const LIGHTNING = 'nvidia/nemotron-3.5-lightning:free';

const schema = z.object({ score: z.number(), reason: z.string() });

interface CapturedRequest {
  model?: string;
  models?: string[];
  tools?: Array<{ function: { name: string } }>;
  tool_choice?: unknown;
  response_format?: unknown;
}

let requests: CapturedRequest[];

/** A chat completion that answers the forced `extract` tool call. */
function toolCallResponse(model: string): Response {
  return new Response(
    JSON.stringify({
      id: 'gen-1',
      object: 'chat.completion',
      created: 0,
      model,
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
                function: { name: 'extract', arguments: '{"score":91,"reason":"strong"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

async function importFactory(provider: 'openrouter' | 'litellm') {
  vi.doMock('../../config/ai.config', () => ({
    aiConfig: {
      provider,
      ollama: { baseUrl: 'http://localhost:11434', model: 'mistral' },
      litellm: { baseUrl: 'http://localhost:4000/v1', masterKey: '', timeout: 120000 },
    },
  }));
  return import('../llm-factory.js');
}

describe('createLLM() on OpenRouter', () => {
  beforeEach(() => {
    vi.resetModules();
    requests = [];
    // Captured by the factory's body-safe fetch at module load, so stub before import.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as CapturedRequest;
        requests.push(body);
        return toolCallResponse(body.model ?? PRIMARY);
      })
    );
    vi.stubEnv('OPENROUTER_API_KEY', ['or', 'test', 'placeholder'].join('-'));
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.example.invalid/api/v1');
    vi.stubEnv('OPENROUTER_MODEL', '');
    vi.stubEnv('OPENROUTER_MODEL_FREE', '');
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('defaults to Nemotron 3 Ultra when OPENROUTER_MODEL is unset', async () => {
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free').invoke('hi');

    expect(requests[0]?.model).toBe(PRIMARY);
  });

  it('an explicit OPENROUTER_MODEL still wins over the default', async () => {
    vi.stubEnv('OPENROUTER_MODEL', 'vendor/explicit-model:free');
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free').invoke('hi');

    expect(requests[0]?.model).toBe('vendor/explicit-model:free');
  });

  it('sends Nemotron 3.5 Lightning as the default OpenRouter `models` fallback', async () => {
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free').invoke('hi');

    expect(requests[0]?.models).toEqual([LIGHTNING]);
  });

  it('sends OPENROUTER_FALLBACK_MODELS in order, trimmed, without the primary', async () => {
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', ` a/one:free , ${PRIMARY},b/two:free,, `);
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free').invoke('hi');

    expect(requests[0]?.models).toEqual(['a/one:free', 'b/two:free']);
  });

  it('drops a paid fallback, which OpenRouter would bill while metering prices it as $0', async () => {
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', 'vendor/paid-model,b/two:free');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free').invoke('hi');

    expect(requests[0]?.models).toEqual(['b/two:free']);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('vendor/paid-model'))).toBe(true);
  });

  it('only paid fallbacks → no `models` list at all', async () => {
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', 'vendor/paid-model');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free').invoke('hi');

    expect(requests[0]).not.toHaveProperty('models');
  });

  it('an empty OPENROUTER_FALLBACK_MODELS sends no `models` list', async () => {
    vi.stubEnv('OPENROUTER_FALLBACK_MODELS', '');
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free').invoke('hi');

    expect(requests[0]).not.toHaveProperty('models');
  });

  it('structured output uses tool calling, not strict json_schema', async () => {
    const { createLLM } = await importFactory('openrouter');
    const result = await createLLM('scoring', 'free').withStructuredOutput(schema).invoke('hi');

    expect(result).toEqual({ score: 91, reason: 'strong' });
    expect(requests[0]?.response_format).toBeUndefined();
    expect(requests[0]?.tools?.[0]?.function.name).toBe('extract');
    expect(requests[0]?.tool_choice).toEqual({ type: 'function', function: { name: 'extract' } });
    // The fallback list rides on structured calls too.
    expect(requests[0]?.models).toEqual([LIGHTNING]);
  });

  it('keeps the caller-supplied structured-output name and options', async () => {
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free')
      .withStructuredOutput(schema, { name: 'auto_response' })
      .invoke('hi')
      .catch(() => undefined); // the fake answers `extract`, so parsing may fail

    expect(requests[0]?.tools?.[0]?.function.name).toBe('auto_response');
    expect(requests[0]?.response_format).toBeUndefined();
  });

  it('an explicit method from the caller is respected', async () => {
    const { createLLM } = await importFactory('openrouter');
    await createLLM('scoring', 'free')
      .withStructuredOutput(schema, { method: 'jsonSchema' })
      .invoke('hi')
      .catch(() => undefined);

    expect(requests[0]?.response_format).toMatchObject({ type: 'json_schema' });
  });

  it('a tenant pin keeps its own OpenRouter model and gets no env fallback list', async () => {
    const { createLLM } = await importFactory('openrouter');
    const { MODEL_CATALOG } = await import('@intelliflow/domain');
    const pinned = MODEL_CATALOG.find((entry) => entry.providers.openrouter);
    expect(pinned).toBeDefined();
    await createLLM('scoring', 'free', { model: pinned!.id }).invoke('hi');

    expect(requests[0]?.model).toBe(pinned!.providers.openrouter);
    expect(requests[0]).not.toHaveProperty('models');
  });

  it('other providers keep the library default (json_schema) structured output', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'http://litellm.example.invalid/v1');
    const { createLLM } = await importFactory('litellm');
    await createLLM('scoring', 'free')
      .withStructuredOutput(schema)
      .invoke('hi')
      .catch(() => undefined);

    expect(requests[0]?.response_format).toMatchObject({ type: 'json_schema' });
    expect(requests[0]).not.toHaveProperty('models');
  });
});
