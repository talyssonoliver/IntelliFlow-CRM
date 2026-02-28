/**
 * Tests for apps/web/src/app/sitemap.ts
 * Covers: MetadataRoute.Sitemap generation for public marketing pages
 * AC-002, AC-004, AC-006
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
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.intelliflow.com');
  // Dynamic import to pick up env stub
  const mod = await import('../sitemap');
  sitemapEntries = mod.default();
});

const VALID_CHANGE_FREQUENCIES = [
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
];

// Authenticated route prefixes that must NOT appear in the sitemap
const AUTH_PROTECTED_PREFIXES = [
  '/dashboard',
  '/leads',
  '/contacts',
  '/accounts',
  '/deals',
  '/tasks',
  '/calendar',
  '/email',
  '/cases',
  '/tickets',
  '/documents',
  '/analytics',
  '/agent-approvals',
  '/billing',
  '/governance',
  '/notifications',
  '/settings',
  '/profile',
  '/docs',
];

// Auth flow paths that must NOT appear in the sitemap
const AUTH_FLOW_PATHS = [
  '/forgot-password',
  '/logout',
  '/reset-password',
  '/mfa',
  '/auth',
  '/verify-email',
];

describe('sitemap()', () => {
  // TC-01
  it('returns a non-empty array', () => {
    expect(Array.isArray(sitemapEntries)).toBe(true);
    expect(sitemapEntries.length).toBeGreaterThan(0);
  });

  // TC-02
  it('has length >= 13 (all static public routes)', () => {
    expect(sitemapEntries.length).toBeGreaterThanOrEqual(13);
  });

  // TC-03
  it('all entries have valid absolute URL in url field', () => {
    for (const entry of sitemapEntries) {
      expect(entry.url).toBeDefined();
      expect(entry.url).toMatch(/^https?:\/\//);
      // Verify it's a valid URL
      expect(() => new URL(entry.url)).not.toThrow();
    }
  });

  // TC-04
  it('all entries have lastModified of type Date or ISO string', () => {
    for (const entry of sitemapEntries) {
      expect(entry.lastModified).toBeDefined();
      if (entry.lastModified instanceof Date) {
        expect(entry.lastModified.getTime()).not.toBeNaN();
      } else {
        // ISO string — must parse to valid date
        expect(new Date(entry.lastModified!).getTime()).not.toBeNaN();
      }
    }
  });

  // TC-05
  it('all entries have valid changeFrequency value', () => {
    for (const entry of sitemapEntries) {
      expect(entry.changeFrequency).toBeDefined();
      expect(VALID_CHANGE_FREQUENCIES).toContain(entry.changeFrequency);
    }
  });

  // TC-06
  it('all entries have priority in range 0.0–1.0', () => {
    for (const entry of sitemapEntries) {
      expect(entry.priority).toBeDefined();
      expect(entry.priority).toBeGreaterThanOrEqual(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });

  // TC-07
  it('root URL / present with priority 1.0', () => {
    const root = sitemapEntries.find(
      (e) => new URL(e.url).pathname === '/'
    );
    expect(root).toBeDefined();
    expect(root!.priority).toBe(1.0);
  });

  // TC-08
  it('no duplicate URLs', () => {
    const urls = sitemapEntries.map((e) => e.url);
    const uniqueUrls = new Set(urls);
    expect(uniqueUrls.size).toBe(urls.length);
  });

  // TC-09
  it('excludes auth-protected routes', () => {
    for (const entry of sitemapEntries) {
      const pathname = new URL(entry.url).pathname;
      for (const prefix of AUTH_PROTECTED_PREFIXES) {
        expect(pathname.startsWith(prefix)).toBe(false);
      }
    }
  });

  // TC-10
  it('excludes auth flow routes', () => {
    for (const entry of sitemapEntries) {
      const pathname = new URL(entry.url).pathname;
      for (const flowPath of AUTH_FLOW_PATHS) {
        expect(pathname.startsWith(flowPath)).toBe(false);
      }
    }
  });

  // TC-11
  it('excludes dynamic [id]/[token] parameterized routes', () => {
    for (const entry of sitemapEntries) {
      expect(entry.url).not.toContain('[');
      expect(entry.url).not.toContain(']');
    }
  });

  // TC-12
  it('uses NEXT_PUBLIC_APP_URL env var for base URL', () => {
    for (const entry of sitemapEntries) {
      expect(entry.url).toMatch(/^https:\/\/test\.intelliflow\.com/);
    }
  });

  // TC-13
  it('/blog URL present', () => {
    const blog = sitemapEntries.find(
      (e) => new URL(e.url).pathname === '/blog'
    );
    expect(blog).toBeDefined();
  });

  // TC-14
  it('/pricing and /features URLs present', () => {
    const pricing = sitemapEntries.find(
      (e) => new URL(e.url).pathname === '/pricing'
    );
    const features = sitemapEntries.find(
      (e) => new URL(e.url).pathname === '/features'
    );
    expect(pricing).toBeDefined();
    expect(features).toBeDefined();
  });
});

describe('sitemap() fallback URL', () => {
  it('uses default base URL when NEXT_PUBLIC_APP_URL is unset', async () => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
    const mod = await import('../sitemap');
    const entries = mod.default();
    const root = entries.find(
      (e: { url: string }) => new URL(e.url).pathname === '/'
    );
    expect(root).toBeDefined();
    expect(root!.url).toBe('https://intelliflow-crm.com');
  });
});
