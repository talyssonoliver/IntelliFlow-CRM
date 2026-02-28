/**
 * Tests for apps/web/src/app/robots.ts
 * Covers: MetadataRoute.Robots generation with allow/disallow rules
 * AC-003, AC-005
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.intelliflow.com');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let robotsResult: any;

beforeEach(async () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.intelliflow.com');
  const mod = await import('../robots');
  robotsResult = mod.default();
});

/** Normalise rules to always be an array */
function getRulesArray(): Array<{
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
}> {
  if (Array.isArray(robotsResult.rules)) {
    return robotsResult.rules;
  }
  return [robotsResult.rules];
}

/** Flatten all disallow entries across all rules into a single array */
function getAllDisallowed(): string[] {
  const disallowed: string[] = [];
  for (const rule of getRulesArray()) {
    if (Array.isArray(rule.disallow)) {
      disallowed.push(...rule.disallow);
    } else if (rule.disallow) {
      disallowed.push(rule.disallow);
    }
  }
  return disallowed;
}

describe('robots()', () => {
  // TC-15
  it('returns a valid object with rules and sitemap properties', () => {
    expect(robotsResult).toBeDefined();
    expect(robotsResult.rules).toBeDefined();
    const rules = getRulesArray();
    expect(rules.length).toBeGreaterThan(0);
    expect(robotsResult.sitemap).toBeDefined();
    expect(typeof robotsResult.sitemap).toBe('string');
  });

  // TC-16
  it('sitemap property is a URL ending with /sitemap.xml', () => {
    expect(robotsResult.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(() => new URL(robotsResult.sitemap)).not.toThrow();
  });

  // TC-17
  it('rules include user agent definition (*)', () => {
    const rules = getRulesArray();
    const hasWildcard = rules.some((r) => {
      if (Array.isArray(r.userAgent)) {
        return r.userAgent.includes('*');
      }
      return r.userAgent === '*';
    });
    expect(hasWildcard).toBe(true);
  });

  // TC-18
  it('disallow list covers /dashboard', () => {
    const disallowed = getAllDisallowed();
    const coversDashboard = disallowed.some(
      (d) => d === '/dashboard' || d === '/dashboard/'
    );
    expect(coversDashboard).toBe(true);
  });

  // TC-19
  it('disallow list covers /api/', () => {
    const disallowed = getAllDisallowed();
    const coversApi = disallowed.some(
      (d) => d === '/api/' || d === '/api'
    );
    expect(coversApi).toBe(true);
  });

  // TC-20
  it('disallow list covers all authenticated route prefixes', () => {
    const authenticatedPrefixes = [
      '/leads',
      '/contacts',
      '/deals',
      '/tickets',
      '/documents',
      '/cases',
      '/calendar',
      '/email',
      '/tasks',
      '/analytics',
      '/agent-approvals',
      '/billing',
      '/governance',
      '/notifications',
      '/settings',
      '/profile',
    ];
    const disallowed = getAllDisallowed();
    for (const prefix of authenticatedPrefixes) {
      const covered = disallowed.some(
        (d) => d === prefix || d === `${prefix}/`
      );
      expect(covered, `Expected ${prefix} to be disallowed`).toBe(true);
    }
  });

  // TC-21
  it('public marketing pages are not disallowed', () => {
    const publicPages = [
      '/',
      '/features',
      '/pricing',
      '/about',
      '/contact',
      '/blog',
      '/careers',
      '/signup',
      '/login',
    ];
    const disallowed = getAllDisallowed();
    for (const page of publicPages) {
      const isDisallowed = disallowed.some(
        (d) => d === page
      );
      expect(isDisallowed, `Expected ${page} to NOT be disallowed`).toBe(false);
    }
  });

  // TC-22
  it('disallow list covers auth flow paths', () => {
    const authFlowPaths = ['/auth/', '/mfa/', '/verify-email/', '/reset-password/'];
    const disallowed = getAllDisallowed();
    for (const path of authFlowPaths) {
      const covered = disallowed.some(
        (d) => d === path || d.startsWith(path.replace(/\/$/, ''))
      );
      expect(covered, `Expected ${path} to be disallowed`).toBe(true);
    }
  });

  // TC-23
  it('disallow list covers /docs (developer portal)', () => {
    const disallowed = getAllDisallowed();
    const coversDocs = disallowed.some(
      (d) => d === '/docs' || d === '/docs/'
    );
    expect(coversDocs).toBe(true);
  });

  // TC-24
  it('uses NEXT_PUBLIC_APP_URL env var for sitemap URL', () => {
    expect(robotsResult.sitemap).toMatch(
      /^https:\/\/test\.intelliflow\.com/
    );
  });
});

describe('robots() fallback URL', () => {
  it('uses default base URL when NEXT_PUBLIC_APP_URL is unset', async () => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
    const mod = await import('../robots');
    const result = mod.default();
    expect(result.sitemap).toBe('https://intelliflow-crm.com/sitemap.xml');
  });
});
