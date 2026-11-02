/**
 * Tests for createBodySafeFetch (prod incident 2026-06; defensive — see #334).
 *
 * These verify the WRAPPER MECHANICS (it hands the SDK a fresh, fully-readable
 * response and never touches streaming bodies). The second reader behind prod's
 * `Body is unusable: Body has already been read` was reproduced on 2026-10-28:
 * it was this wrapper's own fallback after a failed body read (see the last test
 * here and llm-factory.openrouter-socket.test.ts, which drives a real socket).
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

  it('hands back a body something else already read, without reading it again', async () => {
    const disturbed = new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' },
    });
    await disturbed.text();
    const safeFetch = createBodySafeFetch(async () => disturbed);

    await expect(safeFetch('http://llm')).resolves.toBe(disturbed);
  });

  // Prod 2026-10-27: OpenRouter sends headers at once and holds the body open
  // while the model generates. A timeout or a dropped connection then fails the
  // body read here. Handing back the half-read response made the SDK read it a
  // second time ("Body is unusable: Body has already been read"), which hid the
  // real error and stopped the SDK and the tenant fallback from retrying it.
  it('rethrows a failure while reading the body instead of handing back a half-read response', async () => {
    const timeout = new DOMException('This operation was aborted', 'AbortError');
    const failing = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"id":"gen-1",'));
          controller.error(timeout);
        },
      }),
      { headers: { 'content-type': 'application/json' } }
    );
    const safeFetch = createBodySafeFetch(async () => failing);

    await expect(safeFetch('http://llm')).rejects.toBe(timeout);
  });
});
