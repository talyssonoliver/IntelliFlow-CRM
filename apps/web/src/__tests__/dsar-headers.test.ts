/**
 * PG-203 DSAR — response headers for the public data request pages (spec D-AC-10).
 *
 * The confirm and download links carry a token in the URL fragment: no Referer may leave
 * these pages, and nothing they return may be stored by the browser or a cache.
 */
import { describe, it, expect } from 'vitest';

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

async function headerRules(): Promise<HeaderRule[]> {
  const mod = (await import('../../next.config.js')) as {
    default?: { headers: () => Promise<HeaderRule[]> };
    headers?: () => Promise<HeaderRule[]>;
  };
  const config = mod.default ?? mod;
  return config.headers!();
}

describe('/dsar/:path* headers', () => {
  it('sends no Referer and forbids storing the response', async () => {
    const rules = await headerRules();
    const dsar = rules.find((r) => r.source === '/dsar/:path*');
    expect(dsar).toBeDefined();
    expect(dsar!.headers).toEqual(
      expect.arrayContaining([
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
      ])
    );
  });

  it('comes after the site-wide rule, so its Referrer-Policy wins', async () => {
    const rules = await headerRules();
    const all = rules.findIndex((r) => r.source === '/:path*');
    const dsar = rules.findIndex((r) => r.source === '/dsar/:path*');
    expect(all).toBeGreaterThanOrEqual(0);
    expect(dsar).toBeGreaterThan(all);
  });
});
