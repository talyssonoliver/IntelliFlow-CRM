/**
 * Tests for IFC-209 sitemap.ts defect fixes
 * Covers: F-007 (lastModified accuracy), F-008 (blog slug coverage), F-009 (missing dynamic routes)
 * AC-001, AC-002, AC-003, AC-004, AC-005, AC-010
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.intelliflow.com');

let sitemapEntries: Array<{
  url: string;
  lastModified?: Date | string;
  changeFrequency?: string;
  priority?: number;
}>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.intelliflow.com');
  const mod = await import('../sitemap');
  sitemapEntries = mod.default();
});

describe('IFC-209: sitemap defect fixes', () => {
  // TC-NEW-01: Blog slugs from data source
  it('includes all blog post slugs from data source', async () => {
    const { blogPosts } = await import('@/data/blog-posts');
    const blogSlugs = Object.keys(blogPosts);

    for (const slug of blogSlugs) {
      const entry = sitemapEntries.find((e) => new URL(e.url).pathname === `/blog/${slug}`);
      expect(entry, `Missing sitemap entry for blog slug: ${slug}`).toBeDefined();
    }
  });

  // TC-NEW-02: Career entries
  it('includes all 5 career job ID entries', async () => {
    const { jobListings } = await import('@/data/job-listings');
    const jobIds = Object.keys(jobListings);

    expect(jobIds.length).toBe(5);
    for (const id of jobIds) {
      const entry = sitemapEntries.find((e) => new URL(e.url).pathname === `/careers/${id}`);
      expect(entry, `Missing sitemap entry for career ID: ${id}`).toBeDefined();
    }
  });

  // TC-NEW-03: Landing page entries
  it('includes all 3 landing page slug entries', async () => {
    const landingPagesData = await import('@/data/landing-pages.json');
    const lpSlugs = Object.keys(landingPagesData.pages);

    expect(lpSlugs.length).toBe(3);
    for (const slug of lpSlugs) {
      const entry = sitemapEntries.find((e) => new URL(e.url).pathname === `/lp/${slug}`);
      expect(entry, `Missing sitemap entry for LP slug: ${slug}`).toBeDefined();
    }
  });

  // TC-NEW-04: lastModified values NOT all identical (regression guard for F-007)
  it('lastModified values are NOT all identical', () => {
    const timestamps = sitemapEntries.map((e) => {
      if (e.lastModified instanceof Date) {
        return e.lastModified.toISOString();
      }
      return String(e.lastModified);
    });

    const uniqueTimestamps = new Set(timestamps);
    // With real dates from different sources, we should have at least 2 distinct values
    expect(
      uniqueTimestamps.size,
      'All lastModified timestamps are identical — likely still using new Date()'
    ).toBeGreaterThan(1);
  });

  // TC-NEW-04b: Blog post timestamps match publishedAt dates
  it('blog post timestamps match publishedAt from data source', async () => {
    const { blogPosts } = await import('@/data/blog-posts');

    for (const post of Object.values(blogPosts)) {
      const entry = sitemapEntries.find((e) => new URL(e.url).pathname === `/blog/${post.slug}`);
      expect(entry).toBeDefined();

      const expectedDate = post.updatedAt ?? post.publishedAt;
      const actualDate = String(entry!.lastModified);
      expect(actualDate).toBe(expectedDate);
    }
  });

  // TC-NEW-04c: Press release entries
  it('includes all 4 press release ID entries', async () => {
    const pressReleasesData = await import('@/data/press-releases.json');
    const releaseIds = pressReleasesData.releases.map((r: { id: string }) => r.id);

    expect(releaseIds.length).toBe(4);
    for (const id of releaseIds) {
      const entry = sitemapEntries.find((e) => new URL(e.url).pathname === `/press/${id}`);
      expect(entry, `Missing sitemap entry for press release ID: ${id}`).toBeDefined();
    }
  });

  // TC-NEW-04d: Press release timestamps match release dates
  it('press release timestamps match date from data source', async () => {
    const pressReleasesData = await import('@/data/press-releases.json');

    for (const release of pressReleasesData.releases) {
      const entry = sitemapEntries.find((e) => new URL(e.url).pathname === `/press/${release.id}`);
      expect(entry, `Missing entry for /press/${release.id}`).toBeDefined();
      expect(String(entry!.lastModified)).toBe(release.date);
    }
  });

  // TC-NEW-05: Total entry count is 29
  it('total sitemap entry count is exactly 29', () => {
    // 15 static + 2 blog + 5 careers + 3 LP + 4 press = 29
    expect(sitemapEntries.length).toBe(29);
  });

  // TC-NEW-06: No dynamic/static URL overlap
  it('no dynamic route URL duplicates any static route URL', () => {
    const urls = sitemapEntries.map((e) => new URL(e.url).pathname);
    const uniqueUrls = new Set(urls);
    expect(uniqueUrls.size).toBe(urls.length);
  });
});
