/**
 * Unit tests for the shared document text-extraction helpers.
 * Covers fetchDocument, extractTextFromBuffer (every format branch),
 * htmlToText (the non-backtracking script/style strip + its security edge
 * cases) and createChunks.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('pdf-parse', () => {
  class PDFParse {
    async getText() {
      return { text: 'pdf extracted text' };
    }
    async getInfo() {
      return { total: 3 };
    }
  }
  return { PDFParse };
});

vi.mock('mammoth', () => ({
  extractRawText: async () => ({ value: 'docx extracted text' }),
}));

import { fetchDocument, extractTextFromBuffer, htmlToText, createChunks } from '../text-extraction';

function mockFetch(body: string, ok = true): void {
  global.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
  })) as unknown as typeof fetch;
}

describe('fetchDocument', () => {
  it('returns a Buffer for a 2xx response', async () => {
    mockFetch('hello bytes');
    const buf = await fetchDocument('https://example.com/d');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('utf-8')).toBe('hello bytes');
  });

  it('throws a descriptive error on a non-2xx response', async () => {
    mockFetch('', false);
    await expect(fetchDocument('https://example.com/missing')).rejects.toThrow(
      /Failed to fetch document: 404 Not Found/
    );
  });
});

describe('extractTextFromBuffer', () => {
  it('reads plain text (txt/md/rtf)', async () => {
    for (const format of ['txt', 'md', 'rtf']) {
      const res = await extractTextFromBuffer(Buffer.from('plain body'), format);
      expect(res.text).toBe('plain body');
    }
  });

  it('falls back to a utf-8 read for unknown formats', async () => {
    const res = await extractTextFromBuffer(Buffer.from('mystery'), 'xyz');
    expect(res.text).toBe('mystery');
  });

  it('extracts PDF text and page count', async () => {
    const res = await extractTextFromBuffer(Buffer.from('ignored'), 'pdf');
    expect(res.text).toBe('pdf extracted text');
    expect(res.metadata?.pages).toBe(3);
  });

  it('extracts DOCX text', async () => {
    const res = await extractTextFromBuffer(Buffer.from('ignored'), 'docx');
    expect(res.text).toBe('docx extracted text');
  });

  it('strips tags for HTML', async () => {
    const res = await extractTextFromBuffer(
      Buffer.from('<html><body><h1>Title</h1><p>Body</p></body></html>'),
      'html'
    );
    expect(res.text).toContain('Title');
    expect(res.text).toContain('Body');
    expect(res.text).not.toContain('<h1>');
  });
});

describe('htmlToText script/style stripping (non-backtracking)', () => {
  it('removes a closed <script> block and its content', () => {
    const out = htmlToText('<p>Keep</p><script>alert(1)</script>');
    expect(out).toContain('Keep');
    expect(out).not.toContain('alert');
    expect(out.toLowerCase()).not.toContain('script');
  });

  it('removes a <style> block and its content', () => {
    const out = htmlToText('<style>.x{color:red}</style><p>Body</p>');
    expect(out).toContain('Body');
    expect(out).not.toContain('color');
  });

  it('drops an UNCLOSED <script> through end-of-input (no body leak)', () => {
    const out = htmlToText('<p>Visible</p><script>leakedSecret');
    expect(out).toContain('Visible');
    expect(out).not.toContain('leakedSecret');
  });

  it('defeats the multi-character nested bypass <<script>script>', () => {
    const out = htmlToText('<p>Safe</p><<script>script>alert("xss")<</script>/script>');
    expect(out).toContain('Safe');
    expect(out).not.toContain('alert');
    expect(out.toLowerCase()).not.toContain('script');
  });

  it('strips end tags carrying whitespace/junk before > (</script\\t evil >)', () => {
    const out = htmlToText('<p>Keep</p><script>steal()</script\t\n evil >');
    expect(out).toContain('Keep');
    expect(out).not.toContain('steal');
  });

  it('does not treat <scriptx> as a script tag', () => {
    const out = htmlToText('<scriptx>data</scriptx>');
    // <scriptx> is not a real script element; its text is preserved.
    expect(out).toContain('data');
  });

  it('handles an opening tag with no closing > by dropping the remainder', () => {
    const out = htmlToText('<p>Before</p><script foo="bar"');
    expect(out).toContain('Before');
  });
});

describe('createChunks', () => {
  it('returns a single chunk for short text', () => {
    const chunks = createChunks('short text here');
    expect(chunks).toHaveLength(1);
  });

  it('splits long text into multiple overlapping chunks', () => {
    const text = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const chunks = createChunks(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
