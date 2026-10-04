/**
 * Unit tests for tests/e2e/utils/api-preflight.ts — the smoke preflight that turns
 * an HTML answer to an API call into a diagnostic naming the URL and status
 * (CI post-mortem §4B.4: "Unexpected token '<'"). Lives here because tests/e2e is
 * Playwright-only; the helper itself is pure apart from reading the response.
 */
import { describe, it, expect } from 'vitest';
import type { APIResponse } from '@playwright/test';
import { describeNonJsonResponse, expectJsonResponse } from '../e2e/utils/api-preflight';

const HTML = '<!DOCTYPE html><html><head><title>Not found</title></head><body>x</body></html>';

const facts = (over: Partial<Parameters<typeof describeNonJsonResponse>[0]> = {}) => ({
  url: 'http://localhost:3000/api/health',
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: '{"status":"ok"}',
  baseURL: 'http://localhost:3000',
  ...over,
});

describe('describeNonJsonResponse', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'application/problem+json'])(
    'accepts %s',
    (contentType) => {
      expect(describeNonJsonResponse(facts({ contentType }))).toBeNull();
    }
  );

  it('names the URL, status, content type, base URL and an excerpt for an HTML answer', () => {
    const msg = describeNonJsonResponse(
      facts({ status: 404, contentType: 'text/html; charset=utf-8', body: HTML })
    );
    expect(msg).toContain('GET http://localhost:3000/api/health returned HTTP 404');
    expect(msg).toContain('content-type "text/html; charset=utf-8"');
    expect(msg).toContain('HTML page, not the API route');
    expect(msg).toContain('Configured base URL: http://localhost:3000');
    expect(msg).toContain('<!DOCTYPE html>');
  });

  it('recognises HTML by its body even when the content type is missing', () => {
    const msg = describeNonJsonResponse(facts({ contentType: '', body: `  \n${HTML}` }));
    expect(msg).toContain('content-type "(none)"');
    expect(msg).toContain('HTML page');
  });

  it('reports a non-HTML, non-JSON answer without blaming a fallback page', () => {
    const msg = describeNonJsonResponse(facts({ contentType: 'text/plain', body: 'pong' }));
    expect(msg).toContain('The response is not JSON.');
    expect(msg).not.toContain('HTML page');
  });

  it('bounds the excerpt and collapses whitespace', () => {
    const msg = describeNonJsonResponse(
      facts({ contentType: 'text/html', body: `<html>${'a  \n'.repeat(500)}</html>` })
    )!;
    const excerpt = msg.split('Body excerpt (300 chars max): ')[1];
    expect(excerpt.length).toBeLessThanOrEqual(300);
    expect(excerpt).not.toMatch(/\s{2,}/);
  });

  it('says so when the body is empty', () => {
    expect(describeNonJsonResponse(facts({ contentType: 'text/html', body: '' }))).toContain(
      '(empty)'
    );
  });
});

/** The slice of APIResponse the helper reads. */
function fakeResponse(contentType: string | undefined, body: string, status = 200): APIResponse {
  return {
    url: () => 'http://localhost:3000/api/health',
    status: () => status,
    headers: () => (contentType === undefined ? {} : { 'content-type': contentType }),
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as APIResponse;
}

describe('expectJsonResponse', () => {
  it('returns the parsed body for a JSON answer', async () => {
    await expect(
      expectJsonResponse(fakeResponse('application/json', '{"status":"ok"}'), 'http://x')
    ).resolves.toEqual({ status: 'ok' });
  });

  it('throws the diagnostic, with the base URL the request used, before any JSON parse', async () => {
    await expect(
      expectJsonResponse(fakeResponse('text/html', HTML, 404), 'http://preview.example')
    ).rejects.toThrow(/returned HTTP 404[\s\S]*Configured base URL: http:\/\/preview\.example/);
  });

  it('says when no baseURL was configured', async () => {
    await expect(expectJsonResponse(fakeResponse(undefined, HTML), undefined)).rejects.toThrow(
      '(no baseURL configured)'
    );
  });
});
