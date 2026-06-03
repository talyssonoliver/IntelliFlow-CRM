/**
 * Unit tests for the GeminiEmbeddings adapter (Google generativelanguage REST).
 * `fetch` is mocked — no network. Locks: correct endpoint/headers/body
 * (outputDimensionality + taskType), L2-normalization, and clear failure modes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { GeminiEmbeddings } from '../gemini-embeddings';

function okFetch(values: number[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ embedding: { values } }),
    text: async () => '',
  });
}

describe('GeminiEmbeddings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('embedQuery → posts embedContent with outputDimensionality + api-key header, returns L2-normalized vector', async () => {
    const fetchMock = okFetch([3, 4]); // L2 norm 5 → [0.6, 0.8]
    vi.stubGlobal('fetch', fetchMock);

    const emb = new GeminiEmbeddings({ apiKey: 'k', dimensions: 2 });
    const v = await emb.embedQuery('hello');

    expect(v).toEqual([0.6, 0.8]);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toContain('models/gemini-embedding-001:embedContent');
    expect(init.headers['x-goog-api-key']).toBe('k');
    const body = JSON.parse(init.body as string);
    expect(body.outputDimensionality).toBe(2);
    expect(body.taskType).toBe('RETRIEVAL_QUERY');
    expect(body.content.parts[0].text).toBe('hello');
  });

  it('embedDocuments → one RETRIEVAL_DOCUMENT request per text', async () => {
    const fetchMock = okFetch([1, 0]);
    vi.stubGlobal('fetch', fetchMock);

    const emb = new GeminiEmbeddings({ apiKey: 'k', dimensions: 2 });
    const out = await emb.embedDocuments(['a', 'b']);

    expect(out).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).taskType).toBe(
      'RETRIEVAL_DOCUMENT'
    );
  });

  it('defaults to model gemini-embedding-001 and 1536 dims', async () => {
    const fetchMock = okFetch([1]);
    vi.stubGlobal('fetch', fetchMock);

    const emb = new GeminiEmbeddings({ apiKey: 'k' });
    await emb.embedQuery('x');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gemini-embedding-001');
    expect(JSON.parse(init.body as string).outputDimensionality).toBe(1536);
  });

  it('throws a clear error (and makes NO network call) when the key is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const emb = new GeminiEmbeddings({ apiKey: '' });
    await expect(emb.embedQuery('x')).rejects.toThrow(/GEMINI_API_KEY must be set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-OK HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' })
    );
    // maxRetries: 0 so the base AsyncCaller surfaces the error immediately instead
    // of retrying with backoff (prod keeps the default retry behaviour).
    const emb = new GeminiEmbeddings({ apiKey: 'k', maxRetries: 0 });
    await expect(emb.embedQuery('x')).rejects.toThrow(/Gemini embeddings HTTP 429/);
  });
});
