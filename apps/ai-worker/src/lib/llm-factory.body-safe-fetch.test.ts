/**
 * Tests for createBodySafeFetch (prod incident 2026-06).
 *
 * Regression guard for: `TypeError: Body is unusable: Body has already been read`
 * on scoring-chain / insight-generation-chain. The wrapper must hand the OpenAI
 * SDK a response whose body is independently readable from whatever a telemetry
 * interceptor consumes, while passing streaming responses through untouched.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBodySafeFetch } from './llm-factory';

describe('createBodySafeFetch', () => {
  it('returns an independent clone for JSON responses, leaving the original consumable', async () => {
    const original = new Response(JSON.stringify({ ok: true, n: 1 }), {
      headers: { 'content-type': 'application/json' },
    });
    const safeFetch = createBodySafeFetch(async () => original);

    const returned = await safeFetch('http://litellm/v1/chat/completions');

    // The SDK gets a different Response object (a clone), not the original.
    expect(returned).not.toBe(original);
    // The SDK can read its copy...
    expect(await returned.json()).toEqual({ ok: true, n: 1 });
    // ...and the ORIGINAL is still consumable (the interceptor's branch) —
    // this is the exact property whose absence caused the prod error.
    expect(await original.json()).toEqual({ ok: true, n: 1 });
  });

  it('passes streaming (text/event-stream) responses through untouched', async () => {
    const streamed = new Response('data: {"delta":"hi"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    const safeFetch = createBodySafeFetch(async () => streamed);

    const returned = await safeFetch('http://litellm/v1/chat/completions');

    // No clone/tee — we must not buffer token streams in memory.
    expect(returned).toBe(streamed);
  });

  it('passes bodiless responses (e.g. 204) through untouched', async () => {
    const empty = new Response(null, { status: 204 });
    const safeFetch = createBodySafeFetch(async () => empty);

    expect(await safeFetch('http://litellm')).toBe(empty);
  });

  it('forwards the url and init to the underlying fetch unchanged', async () => {
    const base = vi.fn(
      async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
    );
    const safeFetch = createBodySafeFetch(base as unknown as typeof fetch);

    const init = { method: 'POST', body: '{"x":1}' };
    await safeFetch('http://litellm/v1/embeddings', init);

    expect(base).toHaveBeenCalledWith('http://litellm/v1/embeddings', init);
  });

  it('falls back to the original response if clone() throws (best-effort)', async () => {
    // Simulate a response whose body was already disturbed so clone() throws.
    const broken = {
      headers: new Headers({ 'content-type': 'application/json' }),
      body: {} as ReadableStream,
      clone() {
        throw new TypeError('Body has already been read');
      },
    } as unknown as Response;
    const safeFetch = createBodySafeFetch(async () => broken);

    // Must not throw — degrade to handing back the original rather than failing.
    await expect(safeFetch('http://litellm')).resolves.toBe(broken);
  });
});
