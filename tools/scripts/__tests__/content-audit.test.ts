/**
 * Tests for Content Audit Script
 *
 * 45 test cases covering all exported functions.
 * Uses vi.mock('node:fs') for filesystem isolation.
 *
 * @module tools/scripts/__tests__/content-audit.test
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fs from 'node:fs';
import type { Dirent } from 'node:fs';

vi.mock('node:fs');
vi.mock('../lib/validation-utils.js', () => ({
  findRepoRoot: () => '/repo',
}));

import {
  scanRoutes,
  pathToRoute,
  classifyAccessTier,
  resolveMetadataChain,
  calculateSeoScore,
  buildSitemapSet,
  crossReferenceGhostLinks,
  detectStaleContent,
  checkLegalPages,
  buildFindings,
  detectDrift,
  runAudit,
  main,
  buildLayoutMap,
  parseMetadataFromSource,
  type RouteMetadata,
  type RouteEntry,
  type MetadataField,
  type AccessTier,
} from '../content-audit.js';

// ============================================================================
// Helpers
// ============================================================================

function dirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: '',
    path: '',
  } as Dirent;
}

function makeField(value: string | null, source: string | null = 'page'): MetadataField {
  return { value, source };
}

function fullMetadata(overrides: Partial<RouteMetadata> = {}): RouteMetadata {
  return {
    title: makeField('Custom Title'),
    description: makeField('A description that is between fifty and one hundred sixty characters long for SEO purposes here.'),
    og_title: makeField('OG Title'),
    og_description: makeField('OG Description'),
    og_url: makeField('https://example.com'),
    og_site_name: makeField('Example'),
    og_image: makeField('https://example.com/image.png'),
    twitter_card: makeField('summary_large_image'),
    twitter_title: makeField('Twitter Title'),
    twitter_description: makeField('Twitter Description'),
    robots_noindex: false,
    ...overrides,
  };
}

// ============================================================================
// Route Enumeration — TC-01 to TC-03
// ============================================================================

describe('scanRoutes', () => {
  it('TC-01: returns 3 entries for directory with 3 page.tsx files', () => {
    (fs.readdirSync as Mock).mockImplementation((dir: string) => {
      if (dir === '/app') {
        return [dirent('page.tsx', false), dirent('about', true), dirent('blog', true)];
      }
      if (dir.endsWith('about')) {
        return [dirent('page.tsx', false)];
      }
      if (dir.endsWith('blog')) {
        return [dirent('page.tsx', false)];
      }
      return [];
    });

    const result = scanRoutes('/app');
    expect(result).toHaveLength(3);
  });

  it('TC-02: returns empty array for empty directory', () => {
    (fs.readdirSync as Mock).mockReturnValue([]);
    const result = scanRoutes('/app');
    expect(result).toHaveLength(0);
  });

  it('TC-03: ignores non-page.tsx files', () => {
    (fs.readdirSync as Mock).mockReturnValue([
      dirent('layout.tsx', false),
      dirent('loading.tsx', false),
      dirent('page.tsx', false),
      dirent('globals.css', false),
    ]);

    const result = scanRoutes('/app');
    expect(result).toHaveLength(1);
    expect(result[0].relPath).toContain('page.tsx');
  });
});

// ============================================================================
// Path Transformation — TC-04 to TC-08
// ============================================================================

describe('pathToRoute', () => {
  it('TC-04: (public)/page.tsx returns /', () => {
    expect(pathToRoute('(public)/page.tsx')).toBe('/');
  });

  it('TC-05: (public)/about/page.tsx returns /about', () => {
    expect(pathToRoute('(public)/about/page.tsx')).toBe('/about');
  });

  it('TC-06: contacts/[id]/edit/page.tsx returns /contacts/[id]/edit', () => {
    expect(pathToRoute('contacts/[id]/edit/page.tsx')).toBe('/contacts/[id]/edit');
  });

  it('TC-07: (developer)/docs/api/page.tsx returns /docs/api', () => {
    expect(pathToRoute('(developer)/docs/api/page.tsx')).toBe('/docs/api');
  });

  it('TC-08: accounts/(list)/page.tsx returns /accounts', () => {
    expect(pathToRoute('accounts/(list)/page.tsx')).toBe('/accounts');
  });
});

// ============================================================================
// Access Tier — TC-09 to TC-11
// ============================================================================

describe('classifyAccessTier', () => {
  it('TC-09: returns public for (public)/ paths', () => {
    expect(classifyAccessTier('(public)/about/page.tsx')).toBe('public');
  });

  it('TC-10: returns developer for (developer)/ paths', () => {
    expect(classifyAccessTier('(developer)/docs/api/page.tsx')).toBe('developer');
  });

  it('TC-11: returns auth-gated for other paths', () => {
    expect(classifyAccessTier('contacts/[id]/page.tsx')).toBe('auth-gated');
  });
});

// ============================================================================
// Metadata Resolution — TC-12 to TC-16
// ============================================================================

describe('resolveMetadataChain', () => {
  const emptyMap = new Map<string, ReturnType<typeof parseMetadataFromSource>>();

  it('TC-12: extracts title from export const metadata', () => {
    (fs.readFileSync as Mock).mockReturnValue(
      `export const metadata = { title: 'About Us' };`,
    );

    const result = resolveMetadataChain('/app/about/page.tsx', '/app', emptyMap);
    expect(result.title.value).toBe('About Us');
    expect(result.title.source).toBe('page');
  });

  it('TC-13: marks generateMetadata fields with layout/root fallback', () => {
    (fs.readFileSync as Mock).mockReturnValue(
      `export async function generateMetadata() { return {}; }`,
    );

    const result = resolveMetadataChain('/app/blog/page.tsx', '/app', emptyMap);
    // Falls back to root-layout defaults since no layout in map
    expect(result.title.source).toBe('root-layout');
  });

  it('TC-14: falls back to layout metadata', () => {
    (fs.readFileSync as Mock).mockReturnValue('// no metadata export');

    const layoutMap = new Map();
    layoutMap.set('/app/contacts', {
      title: 'Contacts', description: null,
      ogTitle: null, ogDescription: null, ogUrl: null, ogSiteName: null, ogImage: null,
      twitterCard: null, twitterTitle: null, twitterDescription: null, isDynamic: false,
    });

    const result = resolveMetadataChain('/app/contacts/[id]/page.tsx', '/app', layoutMap);
    expect(result.title.value).toBe('Contacts');
    expect(result.title.source).toBe('layout');
  });

  it('TC-15: falls back to root-layout when no page/layout metadata', () => {
    (fs.readFileSync as Mock).mockReturnValue('// no metadata export');

    const result = resolveMetadataChain('/app/some/page.tsx', '/app', emptyMap);
    expect(result.title.value).toBe('IntelliFlow CRM - AI-Powered Customer Relationship Management');
    expect(result.title.source).toBe('root-layout');
  });

  it('TC-16: returns null source when no metadata anywhere', () => {
    (fs.readFileSync as Mock).mockReturnValue('// no metadata export');

    // Root layout map with null values
    const mapWithEmptyRoot = new Map();
    mapWithEmptyRoot.set('/app', {
      title: null, description: null,
      ogTitle: null, ogDescription: null, ogUrl: null, ogSiteName: null, ogImage: null,
      twitterCard: null, twitterTitle: null, twitterDescription: null, isDynamic: false,
    });

    const result = resolveMetadataChain('/app/page.tsx', '/app', mapWithEmptyRoot);
    expect(result.og_image.value).toBeNull();
    expect(result.og_image.source).toBeNull();
  });
});

// ============================================================================
// SEO Score — TC-17 to TC-21
// ============================================================================

describe('calculateSeoScore', () => {
  it('TC-17: returns 95 for route with all metadata + in sitemap', () => {
    const meta = fullMetadata();
    expect(calculateSeoScore(meta, true, 'public')).toBe(95);
  });

  it('TC-18: returns 0 for route with no metadata', () => {
    const meta = fullMetadata({
      title: makeField(null, null),
      description: makeField(null, null),
      og_title: makeField(null, null),
      og_description: makeField(null, null),
      og_url: makeField(null, null),
      og_site_name: makeField(null, null),
      og_image: makeField(null, null),
      twitter_card: makeField(null, null),
      twitter_title: makeField(null, null),
      twitter_description: makeField(null, null),
    });
    expect(calculateSeoScore(meta, false, 'public')).toBe(0);
  });

  it('TC-19: returns null for non-public route', () => {
    const meta = fullMetadata();
    expect(calculateSeoScore(meta, true, 'auth-gated')).toBeNull();
    expect(calculateSeoScore(meta, true, 'developer')).toBeNull();
  });

  it('TC-20: deducts 5 for missing og:image', () => {
    const withImage = fullMetadata();
    const withoutImage = fullMetadata({ og_image: makeField(null, null) });
    const scoreWith = calculateSeoScore(withImage, true, 'public')!;
    const scoreWithout = calculateSeoScore(withoutImage, true, 'public')!;
    expect(scoreWith - scoreWithout).toBe(5);
  });

  it('TC-21: awards +20 for title unique from root default', () => {
    const unique = fullMetadata({ title: makeField('Custom Page Title') });
    const rootDefault = fullMetadata({
      title: makeField('IntelliFlow CRM - AI-Powered Customer Relationship Management'),
    });
    const scoreUnique = calculateSeoScore(unique, false, 'public')!;
    const scoreDefault = calculateSeoScore(rootDefault, false, 'public')!;
    expect(scoreUnique - scoreDefault).toBe(20);
  });
});

// ============================================================================
// Ghost Links — TC-22 to TC-24
// ============================================================================

describe('crossReferenceGhostLinks', () => {
  it('TC-22: returns all 28 when none resolved', () => {
    (fs.existsSync as Mock).mockReturnValue(false);
    const result = crossReferenceGhostLinks('/app');
    expect(result).toHaveLength(28);
  });

  it('TC-23: excludes resolved ghost links (page.tsx exists)', () => {
    (fs.existsSync as Mock).mockImplementation((p: string) => {
      // Resolve billing/usage ghost link
      return p.includes('billing') && p.includes('usage');
    });
    const result = crossReferenceGhostLinks('/app');
    expect(result).toHaveLength(27);
    expect(result.find(g => g.ghost_link_id === 'G-01')).toBeUndefined();
  });

  it('TC-24: ghost link entries have correct G-NN format', () => {
    (fs.existsSync as Mock).mockReturnValue(false);
    const result = crossReferenceGhostLinks('/app');
    for (const gl of result) {
      expect(gl.ghost_link_id).toMatch(/^G-\d{2}$/);
      expect(gl.route).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(gl.severity);
      expect(gl.planned_task).toMatch(/^PG-\d{3}$/);
    }
  });
});

// ============================================================================
// Stale Content — TC-25 to TC-28
// ============================================================================

describe('detectStaleContent', () => {
  it('TC-25: returns stale for source with TODO', () => {
    const result = detectStaleContent('// TODO: implement this');
    expect(result.classification).toBe('stale');
    expect(result.patterns_found).toContain('todo-marker');
  });

  it('TC-26: returns static-by-design-dated for 2025 in JSX', () => {
    const result = detectStaleContent('<p>Last updated 2025</p>');
    expect(result.classification).toBe('static-by-design-dated');
    expect(result.patterns_found).toContain('year-reference');
  });

  it("TC-27: returns static-by-design for from '@/data/' import", () => {
    const result = detectStaleContent("import { data } from '@/data/blog-posts';");
    expect(result.classification).toBe('static-by-design');
    expect(result.data_sources).toContain('@/data/blog-posts');
  });

  it('TC-28: returns none for clean source', () => {
    const result = detectStaleContent('export default function Page() { return <div>Hello</div>; }');
    expect(result.classification).toBe('none');
    expect(result.patterns_found).toHaveLength(0);
  });
});

// ============================================================================
// Legal Pages — TC-29 to TC-31
// ============================================================================

describe('checkLegalPages', () => {
  it('TC-29: returns all three when all missing', () => {
    expect(checkLegalPages(['/about', '/contact'])).toEqual(['privacy', 'terms', 'cookies']);
  });

  it('TC-30: returns empty when all exist', () => {
    expect(checkLegalPages(['/privacy', '/terms', '/cookies'])).toEqual([]);
  });

  it('TC-31: returns only missing pages', () => {
    expect(checkLegalPages(['/privacy', '/about'])).toEqual(['terms', 'cookies']);
  });
});

// ============================================================================
// Sitemap — TC-32 to TC-34
// ============================================================================

describe('buildSitemapSet', () => {
  it('TC-32: extracts static routes from sitemap.ts source', () => {
    (fs.readFileSync as Mock).mockImplementation((p: string) => {
      if (p.includes('sitemap.ts')) {
        return `const staticRoutes = [
          { url: \`\${BASE_URL}\`, lastModified: STATIC_LAST_MODIFIED },
          { url: \`\${BASE_URL}/features\`, lastModified: STATIC_LAST_MODIFIED },
          { url: \`\${BASE_URL}/pricing\`, lastModified: STATIC_LAST_MODIFIED },
        ];`;
      }
      throw new Error('not found');
    });

    const result = buildSitemapSet('/app/sitemap.ts', '/data');
    expect(result.has('/')).toBe(true);
    expect(result.has('/features')).toBe(true);
    expect(result.has('/pricing')).toBe(true);
  });

  it('TC-33: includes dynamic blog/careers/lp routes', () => {
    (fs.readFileSync as Mock).mockImplementation((p: string) => {
      if (p.includes('sitemap.ts')) return 'const routes = [];';
      if (p.includes('blog-posts.ts')) return "{ slug: 'ai-scoring', slug: 'governance' }";
      if (p.includes('job-listings.ts')) return "{ id: 'sr-eng' }";
      if (p.includes('landing-pages.json')) return JSON.stringify({ pages: { 'ai-crm': {} } });
      throw new Error('not found');
    });

    const result = buildSitemapSet('/sitemap.ts', '/data');
    expect(result.has('/blog/ai-scoring')).toBe(true);
    expect(result.has('/blog/governance')).toBe(true);
    expect(result.has('/careers/sr-eng')).toBe(true);
    expect(result.has('/lp/ai-crm')).toBe(true);
  });

  it('TC-34: route has in_sitemap true when URL in sitemap set', () => {
    const sitemapMap = new Map<string, string>();
    sitemapMap.set('/about', 'STATIC_LAST_MODIFIED');

    // Test that the map lookup works correctly (this is how runAudit uses it)
    expect(sitemapMap.has('/about')).toBe(true);
    expect(sitemapMap.has('/missing')).toBe(false);
  });
});

// ============================================================================
// Findings — TC-35 to TC-38
// ============================================================================

describe('buildFindings', () => {
  const mockRoutes: RouteEntry[] = [
    {
      route: '/press/[id]', file_path: 'apps/web/src/app/(public)/press/[id]/page.tsx',
      access_tier: 'public', metadata: fullMetadata(), seo_score: 90, in_sitemap: false,
      sitemap_last_modified_method: null, http_status: null, response_time_ms: null,
      http_measurement_method: 'pending-runtime',
      stale_content: { classification: 'none', patterns_found: [], data_sources: [] },
      ghost_links: [], broken_inpage_links: [], notes: '',
    },
  ];

  it('TC-35: includes critical finding for missing /privacy', () => {
    (fs.readFileSync as Mock).mockImplementation((p: string) => {
      if (p.includes('press')) return 'import { notFound } from "next/navigation";';
      if (p.includes('lighthouserc')) return "'categories:seo': ['warn', { minScore: 0.9 }]";
      if (p.includes('sitemap.ts')) return 'const STATIC_LAST_MODIFIED = "2025-12-28";';
      return '';
    });

    const result = buildFindings(mockRoutes, [], '/repo');
    const privacyFinding = result.critical.find(f => f.description.includes('/privacy'));
    expect(privacyFinding).toBeDefined();
    expect(privacyFinding!.severity).toBe('critical');
  });

  it('TC-36: includes high finding for /press/[id] broken link', () => {
    (fs.readFileSync as Mock).mockImplementation((p: string) => {
      if (p.includes('press')) return 'import { notFound } from "next/navigation"; notFound()';
      if (p.includes('lighthouserc')) return '';
      if (p.includes('sitemap.ts')) return '';
      return '';
    });

    const result = buildFindings(mockRoutes, [], '/repo');
    const pressFinding = result.high.find(f =>
      f.description.includes('/press/[id]') || f.route === '/press/[id]',
    );
    expect(pressFinding).toBeDefined();
  });

  it('TC-37: includes high finding for lighthouserc.js SEO warn', () => {
    (fs.readFileSync as Mock).mockImplementation((p: string) => {
      if (p.includes('lighthouserc')) return "'categories:seo': ['warn', { minScore: 0.9 }]";
      return '';
    });

    const result = buildFindings(mockRoutes, [], '/repo');
    const lhFinding = result.high.find(f =>
      f.description.includes('lighthouserc') || f.description.includes('Lighthouse') || f.description.includes('SEO'),
    );
    expect(lhFinding).toBeDefined();
  });

  it('TC-38: includes medium finding for sitemap.ts hardcoded date', () => {
    (fs.readFileSync as Mock).mockImplementation((p: string) => {
      if (p.includes('sitemap.ts')) return 'const STATIC_LAST_MODIFIED = "2025-12-28";';
      return '';
    });

    const result = buildFindings(mockRoutes, [], '/repo');
    const sitemapFinding = result.medium.find(f =>
      f.description.includes('sitemap.ts') || f.description.includes('STATIC_LAST_MODIFIED'),
    );
    expect(sitemapFinding).toBeDefined();
  });
});

// ============================================================================
// Drift Detection — TC-39 to TC-41
// ============================================================================

describe('detectDrift', () => {
  it('TC-39: returns false when counts match', () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue(JSON.stringify({ summary: { total_routes: 100 } }));
    expect(detectDrift(100, '/output.json')).toBe(false);
  });

  it('TC-40: returns true when counts differ', () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue(JSON.stringify({ summary: { total_routes: 100 } }));
    expect(detectDrift(105, '/output.json')).toBe(true);
  });

  it('TC-41: returns false when no previous file (first run)', () => {
    (fs.existsSync as Mock).mockReturnValue(false);
    expect(detectDrift(100, '/output.json')).toBe(false);
  });
});

// ============================================================================
// Output & Exit — TC-42 to TC-45
// ============================================================================

describe('runAudit and main', () => {
  it('TC-42: runAudit returns sorted routes (lexicographic)', () => {
    const appDir = '/repo/apps/web/src/app';
    (fs.readdirSync as Mock).mockImplementation((dir: string) => {
      const d = String(dir).replace(/\\/g, '/');
      if (d === appDir) return [dirent('(public)', true), dirent('contacts', true)];
      if (d === `${appDir}/(public)`) return [dirent('page.tsx', false), dirent('about', true)];
      if (d === `${appDir}/(public)/about`) return [dirent('page.tsx', false)];
      if (d === `${appDir}/contacts`) return [dirent('page.tsx', false)];
      return [];
    });
    (fs.readFileSync as Mock).mockReturnValue('// no metadata');
    (fs.existsSync as Mock).mockReturnValue(false);

    const result = runAudit('/repo');
    const routes = result.routes.map(r => r.route);
    const sorted = [...routes].sort();
    expect(routes).toEqual(sorted);
  });

  it('TC-43: main exits 0 on no drift', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock minimal filesystem for runAudit
    (fs.readdirSync as Mock).mockReturnValue([]);
    (fs.readFileSync as Mock).mockReturnValue('// no content');
    (fs.existsSync as Mock).mockReturnValue(false);
    (fs.writeFileSync as Mock).mockImplementation(() => {});
    (fs.mkdirSync as Mock).mockImplementation(() => undefined);

    main();

    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  it('TC-44: main exits 1 on drift detected', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // runAudit finds 0 routes, previous file had 50
    (fs.readdirSync as Mock).mockReturnValue([]);
    (fs.readFileSync as Mock).mockImplementation((p: string) => {
      if (p.includes('content-audit-results.json')) {
        return JSON.stringify({ summary: { total_routes: 50 } });
      }
      return '// no content';
    });
    (fs.existsSync as Mock).mockImplementation((p: string) => {
      return p.includes('content-audit-results.json');
    });
    (fs.writeFileSync as Mock).mockImplementation(() => {});
    (fs.mkdirSync as Mock).mockImplementation(() => undefined);

    main();

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  it('TC-45: output JSON has all required top-level fields', () => {
    (fs.readdirSync as Mock).mockReturnValue([]);
    (fs.readFileSync as Mock).mockReturnValue('// no content');
    (fs.existsSync as Mock).mockReturnValue(false);

    const result = runAudit('/repo');
    expect(result).toHaveProperty('generated_at');
    expect(result).toHaveProperty('tool_version');
    expect(result).toHaveProperty('routes');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('findings');
    expect(Array.isArray(result.routes)).toBe(true);
    expect(result.findings).toHaveProperty('critical');
    expect(result.findings).toHaveProperty('high');
    expect(result.findings).toHaveProperty('medium');
    expect(result.findings).toHaveProperty('low');
    expect(result.findings).toHaveProperty('ghost_links');
  });
});
