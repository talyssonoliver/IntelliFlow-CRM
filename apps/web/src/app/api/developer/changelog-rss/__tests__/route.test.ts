/**
 * @vitest-environment node
 *
 * Covers #229: the feed's base URL resolves from `NEXT_PUBLIC_APP_URL` when
 * set, and otherwise falls back to the canonical production domain
 * (`https://intelli-flow-crm-web.vercel.app`) rather than a stale
 * `intelliflow-crm.com`/`.dev` claim (route.ts:5).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from '../route';

describe('GET /api/developer/changelog-rss', () => {
  const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (ORIGINAL_APP_URL === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
    }
  });

  it('returns a well-formed RSS 2.0 feed with the right content type', async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600');
    expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(body).toContain('<rss version="2.0"');
    expect(body).toContain('<title>Aurora Changelog</title>');
  });

  it('builds feed links from NEXT_PUBLIC_APP_URL when it is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://staging.example.invalid');

    const response = await GET();
    const body = await response.text();

    expect(body).toContain('<link>https://staging.example.invalid/docs/changelog</link>');
    expect(body).not.toContain('intelli-flow-crm-web.vercel.app');
  });

  it('falls back to the canonical production domain when NEXT_PUBLIC_APP_URL is unset', async () => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_APP_URL;

    const response = await GET();
    const body = await response.text();

    expect(body).toContain('<link>https://intelli-flow-crm-web.vercel.app/docs/changelog</link>');
    expect(body).toContain('https://intelli-flow-crm-web.vercel.app/api/developer/changelog-rss');
  });
});
