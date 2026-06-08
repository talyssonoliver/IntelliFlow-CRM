/**
 * Tests for createBodySafeFetch (prod incident 2026-06; defensive — see #334).
 *
 * These verify the WRAPPER MECHANICS (it hands the SDK a fresh, fully-readable
 * response and never touches streaming bodies). They do NOT prove the prod
 * `Body is unusable: Body has already been read` is fixed — the real second
 * reader was never reproduced; verification is tracked in #334.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBodySafeFetch } from './llm-factory';

describe('createBodySafeFetch', () => {
  it('hands the SDK a fresh, fully-readable Response built from the buffered body', async () => {
    const original = new Response(JSON.stringify({ ok: true, n: 1 }), {
      headers: { 'content-type': 'application/json' },
    });
    const safeFetch = createBodySafeFetch(async () => original);

    const returned = await safeFetch('http://llm/v1/chat/completions');

    // The SDK gets a brand-new Response object, not the upstream one...
    expect(returned).not.toBe(original);
    // ...whose body it can read.
    expect(await returned.json()).toEqual({ ok: true, n: 1 });
    // We consumed the upstream body exactly once (that's the point — nothing
    // downstream shares a half-read stream with the SDK).
    expect(original.bodyUsed).toBe(true);
  });

  it('strips content-encoding/content-length so the SDK does not double-decompress', async () => {
    // fetch already decompressed the body; the re-wrapped Response must not keep
    // the original encoding headers or the SDK would try to gunzip plain bytes.
    const original = new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': '999',
      },
    });
    const safeFetch = createBodySafeFetch(async () => original);

    const returned = await safeFetch('http://llm/v1/chat/completions');

    expect(returned.headers.get('content-encoding')).toBeNull();
    expect(returned.headers.get('content-length')).toBeNull();
    expect(returned.headers.get('content-type')).toBe('application/json');
    expect(await returned.json()).toEqual({ ok: true });
  });

  it('preserves status and statusText on the re-wrapped Response', async () => {
    const original = new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'content-type': 'application/json' },
    });
    const safeFetch = createBodySafeFetch(async () => original);

    const returned = await safeFetch('http://llm/v1/chat/completions');

    expect(returned.status).toBe(429);
    expect(returned.statusText).toBe('Too Many Requests');
    expect(await returned.json()).toEqual({ error: 'rate_limited' });
  });

  it('passes streaming (text/event-stream) responses through untouched', async () => {
    const streamed = new Response('data: {"delta":"hi"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    const safeFetch = createBodySafeFetch(async () => streamed);

    // No buffering — we must not pull token streams into memory.
    expect(await safeFetch('http://llm/v1/chat/completions')).toBe(streamed);
    expect(streamed.bodyUsed).toBe(false);
  });

  it('passes bodiless responses (e.g. 204) through untouched', async () => {
    const empty = new Response(null, { status: 204 });
    const safeFetch = createBodySafeFetch(async () => empty);

    expect(await safeFetch('http://llm')).toBe(empty);
  });

  it('forwards the url and init to the underlying fetch unchanged', async () => {
    const base = vi.fn(
      async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
    );
    const safeFetch = createBodySafeFetch(base as unknown as typeof fetch);

    const init = { method: 'POST', body: '{"x":1}' };
    await safeFetch('http://llm/v1/embeddings', init);

    expect(base).toHaveBeenCalledWith('http://llm/v1/embeddings', init);
  });

  it('falls back to the original response if reading the body throws (best-effort)', async () => {
    // Simulate an upstream body already disturbed so arrayBuffer() throws.
    const broken = {
      headers: new Headers({ 'content-type': 'application/json' }),
      body: {} as ReadableStream,
      arrayBuffer() {
        throw new TypeError('Body has already been read');
      },
    } as unknown as Response;
    const safeFetch = createBodySafeFetch(async () => broken);

    // Must not throw — degrade to handing back the original rather than failing.
    await expect(safeFetch('http://llm')).resolves.toBe(broken);
  });
});
