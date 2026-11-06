/**
 * Press release pages in the sitemap: one entry per published release, dated by the
 * release. No release is published today, so a sample list is mocked here.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/data/press-releases.json', () => ({
  default: {
    metadata: { lastUpdated: '2026-11-06', totalReleases: 1 },
    releases: [{ id: 'pr-sample', date: '2026-11-01' }],
  },
}));

describe('sitemap press routes', () => {
  it('lists each published release with its date', async () => {
    const { default: sitemap } = await import('../sitemap');
    const entry = sitemap().find((e) => new URL(e.url).pathname === '/press/pr-sample');

    expect(entry).toBeDefined();
    expect(String(entry!.lastModified)).toBe('2026-11-01');
    expect(entry!.priority).toBe(0.5);
  });
});
