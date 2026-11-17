/**
 * RANKED-3: /deals/pipeline is not a page. The deal page took "pipeline" for a deal id and sat on
 * a skeleton while the failed lookup was retried, so the link now goes to the board.
 */

import { describe, expect, it, vi } from 'vitest';

type Redirect = { source: string; destination: string; permanent: boolean };

async function redirects(): Promise<Redirect[]> {
  vi.resetModules();
  const mod = (await import('../../next.config.js')) as {
    default?: { redirects?: () => Promise<Redirect[]> };
    redirects?: () => Promise<Redirect[]>;
  };
  const config = mod.default ?? mod;
  return (await config.redirects?.()) ?? [];
}

describe('next.config redirects: /deals/pipeline', () => {
  it('sends the old pipeline link to the board, not permanently', async () => {
    const found = (await redirects()).find((r) => r.source === '/deals/pipeline');

    expect(found).toEqual({
      source: '/deals/pipeline',
      destination: '/deals?view=pipeline',
      permanent: false,
    });
  });

  it('leaves the deal page alone for a real deal id', async () => {
    const sources = (await redirects()).map((r) => r.source);

    expect(sources).not.toContain('/deals/:id');
    expect(sources).not.toContain('/deals/:path*');
  });
});
