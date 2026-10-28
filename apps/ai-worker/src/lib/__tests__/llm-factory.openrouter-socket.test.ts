/**
 * OpenRouter over a real socket (prod regression 2026-10-27, 21:59-22:06Z).
 *
 * Every OpenRouter call from combined-worker failed with "TypeError: Body is unusable:
 * Body has already been read". OpenRouter sends the response headers at once and holds
 * the body open while the model generates (and while it walks the `models` fallbacks),
 * so a timeout or a dropped connection fails while the body is being read. The
 * factory's body-safe fetch then handed the half-read response to the SDK, which read
 * it a second time. That hid the real error, and the SDK's retry and the tenant
 * fallback never saw a timeout or a connection error to act on.
 *
 * The other OpenRouter tests stub `fetch`, which cannot show this: a stubbed Response
 * never fails mid-body. Here the REAL global fetch talks to a local HTTP server that
 * answers like OpenRouter, so the factory's own fetch wrapper is on the path. No
 * external network.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@intelliflow/db', () => ({
  prisma: { tenantAIConfig: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

// Tracing is not under test here; keep the model as built.
vi.mock('../../tracing/llm-tracer.js', () => ({
  wrapModelWithTracing: vi.fn((model: unknown) => model),
  wrapEmbeddingsWithTracing: vi.fn((embeddings: unknown) => embeddings),
}));

const schema = z.object({ score: z.number(), reason: z.string() });

const COMPLETION = JSON.stringify({
  id: 'gen-1',
  object: 'chat.completion',
  created: 0,
  model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
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
});

/** How the stub answers each request, in order; the last one repeats. */
type Answer = 'ok' | 'gzip' | 'cut' | 'stall';
let script: Answer[] = ['ok'];
let served = 0;
let server: Server;
let baseUrl = '';

function answer(res: ServerResponse, how: Answer) {
  if (how === 'ok') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(COMPLETION);
  } else if (how === 'gzip') {
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
    res.end(gzipSync(COMPLETION));
  } else if (how === 'cut') {
    // Headers and part of the body, then the connection drops.
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(COMPLETION.length),
    });
    res.write(COMPLETION.slice(0, 40));
    setTimeout(() => res.socket?.destroy(), 20);
  } else {
    // Headers at once, then the body stalls past the client timeout.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write(' ');
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const how = script[Math.min(served, script.length - 1)] ?? 'ok';
      served += 1;
      answer(res, how);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

async function scoreOnce(options: { timeout?: number } = {}) {
  vi.resetModules();
  vi.doMock('../../config/ai.config', () => ({
    aiConfig: {
      provider: 'openrouter',
      ollama: { baseUrl: 'http://localhost:11434', model: 'mistral' },
      litellm: { baseUrl: 'http://localhost:4000/v1', masterKey: '', timeout: 120000 },
    },
  }));
  const { createLLM } = await import('../llm-factory.js');
  return createLLM('scoring', 'free', options)
    .withStructuredOutput(schema, { name: 'extract' })
    .invoke('score this lead');
}

describe('createLLM() on OpenRouter over a real socket', () => {
  beforeEach(() => {
    served = 0;
    vi.stubEnv('OPENROUTER_API_KEY', ['or', 'test', 'placeholder'].join('-'));
    vi.stubEnv('OPENROUTER_BASE_URL', baseUrl);
    vi.stubEnv('OPENROUTER_MODEL', '');
    vi.stubEnv('OPENROUTER_MODEL_FREE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses a plain answer', async () => {
    script = ['ok'];
    await expect(scoreOnce()).resolves.toEqual({ score: 91, reason: 'strong' });
  });

  it('parses a gzip answer', async () => {
    script = ['gzip'];
    await expect(scoreOnce()).resolves.toEqual({ score: 91, reason: 'strong' });
  });

  it('a connection dropped mid-body is retried, and the retry answers', async () => {
    script = ['cut', 'ok'];
    await expect(scoreOnce()).resolves.toEqual({ score: 91, reason: 'strong' });
    expect(served).toBe(2);
  }, 30_000);

  it('a body that stalls past the timeout is retried as a timeout, and the retry answers', async () => {
    script = ['stall', 'ok'];
    await expect(scoreOnce({ timeout: 300 })).resolves.toEqual({ score: 91, reason: 'strong' });
    expect(served).toBe(2);
  }, 30_000);
});
