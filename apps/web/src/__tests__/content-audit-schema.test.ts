import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, statSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../../..');
const AUDIT_PATH = resolve(REPO_ROOT, 'artifacts/reports/content-audit-results.json');

interface MetadataField {
  value: string | null;
  source: string | null;
  length?: number;
}

interface RouteMetadata {
  title: MetadataField;
  description: MetadataField;
  og_title: MetadataField;
  og_description: MetadataField;
  og_url: MetadataField;
  og_site_name: MetadataField;
  og_image: MetadataField;
  twitter_card: MetadataField;
  twitter_title: MetadataField;
  twitter_description: MetadataField;
  robots_noindex: boolean;
}

interface RouteEntry {
  route: string;
  file_path: string;
  access_tier: 'public' | 'auth-gated' | 'developer';
  metadata: RouteMetadata;
  seo_score: number | null;
  in_sitemap: boolean;
  sitemap_last_modified_method: string | null;
  http_status: number | null;
  response_time_ms: number | null;
  http_measurement_method: string;
  stale_content: {
    classification: string;
    patterns_found: string[];
    data_sources: string[];
  };
  ghost_links: string[];
  broken_inpage_links: string[];
  notes: string;
}

interface GhostLinkFinding {
  ghost_link_id: string;
  route: string;
  severity: string;
  planned_task: string;
  description: string;
}

interface Finding {
  id: string;
  type: string;
  severity: string;
  description: string;
  file?: string;
  route?: string;
  remediation?: string;
}

interface AuditSummary {
  total_routes: number;
  public_routes: number;
  auth_gated_routes: number;
  developer_routes: number;
  routes_with_seo_score: number;
  routes_pending_runtime_measurement: number;
  average_seo_score_public: number;
  legal_pages_missing: string[];
  ghost_link_count: number;
}

interface AuditData {
  generated_at: string;
  tool_version: string;
  routes: RouteEntry[];
  summary: AuditSummary;
  findings: {
    critical: Finding[];
    high: Finding[];
    medium: Finding[];
    low: Finding[];
    ghost_links: GhostLinkFinding[];
  };
}

let auditData: AuditData;

beforeAll(() => {
  const raw = readFileSync(AUDIT_PATH, 'utf-8');
  auditData = JSON.parse(raw);
});

describe('Content Audit Results Schema Validation', () => {
  // TC-01: JSON parses as valid JSON and validates against inline schema (TR-001, NF-003)
  it('TC-01: parses as valid JSON with correct top-level structure', () => {
    expect(auditData).toHaveProperty('generated_at');
    expect(auditData).toHaveProperty('tool_version');
    expect(auditData).toHaveProperty('routes');
    expect(auditData).toHaveProperty('summary');
    expect(auditData).toHaveProperty('findings');

    expect(Array.isArray(auditData.routes)).toBe(true);
    expect(typeof auditData.summary).toBe('object');
    expect(typeof auditData.findings).toBe('object');

    // Validate summary structure
    expect(auditData.summary).toHaveProperty('total_routes');
    expect(auditData.summary).toHaveProperty('public_routes');
    expect(auditData.summary).toHaveProperty('auth_gated_routes');
    expect(auditData.summary).toHaveProperty('developer_routes');
    expect(auditData.summary).toHaveProperty('legal_pages_missing');
    expect(auditData.summary).toHaveProperty('ghost_link_count');

    // Validate findings structure
    expect(auditData.findings).toHaveProperty('critical');
    expect(auditData.findings).toHaveProperty('high');
    expect(auditData.findings).toHaveProperty('medium');
    expect(auditData.findings).toHaveProperty('ghost_links');
    expect(Array.isArray(auditData.findings.critical)).toBe(true);
    expect(Array.isArray(auditData.findings.high)).toBe(true);
    expect(Array.isArray(auditData.findings.medium)).toBe(true);
    expect(Array.isArray(auditData.findings.ghost_links)).toBe(true);

    // Validate each route has correct field types
    for (const route of auditData.routes) {
      expect(typeof route.route).toBe('string');
      expect(typeof route.file_path).toBe('string');
      expect(['public', 'auth-gated', 'developer']).toContain(route.access_tier);
      expect(typeof route.metadata).toBe('object');
      expect(typeof route.in_sitemap).toBe('boolean');
      expect(typeof route.http_measurement_method).toBe('string');
    }
  });

  // TC-02: summary.total_routes equals filesystem page.tsx count (AC-001, TR-002)
  it('TC-02: summary.total_routes equals filesystem page.tsx count', () => {
    function countPageFiles(dir: string): number {
      let count = 0;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          count += countPageFiles(resolve(dir, entry.name));
        } else if (entry.name === 'page.tsx') {
          count++;
        }
      }
      return count;
    }
    const filesystemCount = countPageFiles(resolve(REPO_ROOT, 'apps/web/src/app'));

    expect(auditData.summary.total_routes).toBe(filesystemCount);
    expect(auditData.routes.length).toBe(filesystemCount);
  });

  // TC-03: Every route entry has all required fields (AC-002)
  it('TC-03: every route entry has all required fields', () => {
    const requiredMetadataFields = [
      'title',
      'description',
      'og_title',
      'og_description',
      'og_url',
      'og_site_name',
      'og_image',
      'twitter_card',
      'twitter_title',
      'twitter_description',
      'robots_noindex',
    ];

    for (const route of auditData.routes) {
      expect(route).toHaveProperty('route');
      expect(route).toHaveProperty('file_path');
      expect(route).toHaveProperty('access_tier');
      expect(route).toHaveProperty('metadata');
      expect(route).toHaveProperty('seo_score');
      expect(route).toHaveProperty('in_sitemap');
      expect(route).toHaveProperty('http_status');
      expect(route).toHaveProperty('response_time_ms');
      expect(route).toHaveProperty('http_measurement_method');

      for (const field of requiredMetadataFields) {
        expect(route.metadata).toHaveProperty(field);
      }
    }
  });

  // TC-04: All 26 public routes have seo_score as integer 0-100 (AC-003)
  it('TC-04: all public routes have integer seo_score 0-100', () => {
    const publicRoutes = auditData.routes.filter((r) => r.access_tier === 'public');
    expect(publicRoutes.length).toBe(26);

    for (const route of publicRoutes) {
      expect(typeof route.seo_score).toBe('number');
      expect(Number.isInteger(route.seo_score)).toBe(true);
      expect(route.seo_score).toBeGreaterThanOrEqual(0);
      expect(route.seo_score).toBeLessThanOrEqual(100);
    }
  });

  // TC-05: Auth-gated and developer routes have seo_score: null (AC-003)
  it('TC-05: auth-gated and developer routes have seo_score null', () => {
    const nonPublicRoutes = auditData.routes.filter(
      (r) => r.access_tier === 'auth-gated' || r.access_tier === 'developer'
    );
    expect(nonPublicRoutes.length).toBe(auditData.routes.length - 26);

    for (const route of nonPublicRoutes) {
      expect(route.seo_score).toBeNull();
    }
  });

  // TC-06: findings contains exactly 28 ghost link references (AC-004, TR-005)
  it('TC-06: findings contains exactly 28 ghost links with required fields', () => {
    expect(auditData.findings.ghost_links.length).toBe(28);
    expect(auditData.summary.ghost_link_count).toBe(28);

    for (const gl of auditData.findings.ghost_links) {
      expect(gl).toHaveProperty('ghost_link_id');
      expect(gl).toHaveProperty('severity');
      expect(gl).toHaveProperty('planned_task');
      expect(gl.ghost_link_id).toMatch(/^G-\d{2}$/);
      expect(['high', 'medium', 'low']).toContain(gl.severity);
      expect(gl.planned_task).toMatch(/^PG-\d{3}$/);
    }
  });

  // TC-07: summary.legal_pages_missing contains privacy, terms, cookies (AC-005)
  it('TC-07: summary.legal_pages_missing contains required pages', () => {
    expect(auditData.summary.legal_pages_missing).toEqual(
      expect.arrayContaining(['privacy', 'terms', 'cookies'])
    );
    expect(auditData.summary.legal_pages_missing.length).toBe(3);
  });

  // TC-08: findings.critical contains entry referencing /privacy (AC-005, TR-004)
  it('TC-08: findings.critical contains legal page reference', () => {
    const privacyFinding = auditData.findings.critical.find(
      (f) => f.description.includes('/privacy') || f.route === '/privacy'
    );
    expect(privacyFinding).toBeDefined();
  });

  // TC-09: findings.high contains /press/[id] broken link entry (AC-006)
  it('TC-09: findings.high contains /press/[id] broken link', () => {
    const pressFinding = auditData.findings.high.find(
      (f) =>
        f.description.includes('/press/[id]') ||
        f.description.includes('/press/') ||
        f.route === '/press/[id]'
    );
    expect(pressFinding).toBeDefined();
  });

  // TC-10: findings contains sitemap.ts lastModified defect with medium severity (AC-007)
  it('TC-10: findings contains sitemap.ts lastModified defect', () => {
    const sitemapFinding = auditData.findings.medium.find(
      (f) =>
        f.description.includes('sitemap.ts') ||
        f.description.includes('lastModified') ||
        f.file === 'sitemap.ts'
    );
    expect(sitemapFinding).toBeDefined();
  });

  // TC-11: findings contains lighthouserc.js SEO warn with high severity (AC-008)
  it('TC-11: findings contains lighthouserc.js SEO warn level', () => {
    const lhFinding = auditData.findings.high.find(
      (f) =>
        f.description.includes('lighthouserc') ||
        f.description.includes('Lighthouse') ||
        f.file === 'lighthouserc.js'
    );
    expect(lhFinding).toBeDefined();
  });

  // TC-12: Routes sorted lexicographically by route field (NF-002)
  it('TC-12: routes are sorted lexicographically by route', () => {
    const routes = auditData.routes.map((r) => r.route);
    const sorted = [...routes].sort();
    expect(routes).toEqual(sorted);
  });

  // TC-13: JSON file size under 500KB (NF-006)
  it('TC-13: JSON file size is under 500KB', () => {
    const stats = statSync(AUDIT_PATH);
    expect(stats.size).toBeLessThan(500 * 1024);
  });

  // TC-14: No fabricated http_status or response_time_ms for auth-gated routes (NF-005)
  it('TC-14: no fabricated values for auth-gated routes', () => {
    const nonPublicRoutes = auditData.routes.filter(
      (r) => r.access_tier === 'auth-gated' || r.access_tier === 'developer'
    );

    for (const route of nonPublicRoutes) {
      expect(route.http_status).toBeNull();
      expect(route.response_time_ms).toBeNull();
      expect(route.http_measurement_method).toBe('pending-runtime');
    }
  });
});
