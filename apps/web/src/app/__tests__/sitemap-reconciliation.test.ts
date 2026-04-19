/**
 * Tests for sitemap reconciliation against filesystem reality
 * Covers: Route count regression guard, public route validation
 * AC-006, AC-007
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPageFiles } from './test-helpers/ia-fs-helpers';

vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.intelliflow.com');

const APP_DIR = path.resolve(__dirname, '..');
const AUTH_FLOW_PATHS = [
  '/forgot-password',
  '/logout',
  '/reset-password',
  '/mfa',
  '/auth',
  '/verify-email',
];

let sitemapEntries: Array<{ url: string; priority?: number }>;

beforeAll(async () => {
  const mod = await import('../sitemap');
  sitemapEntries = mod.default();
});

describe('Sitemap Reconciliation', () => {
  // TC-25
  it('total page.tsx count equals 205 (regression guard)', () => {
    const pageFiles = findPageFiles(APP_DIR);
    expect(pageFiles.length).toBe(205);
  });

  // TC-26
  it('all sitemap URLs map to valid public routes', () => {
    for (const entry of sitemapEntries) {
      const pathname = new URL(entry.url).pathname;
      // All sitemap URLs should be public marketing pages — no authenticated app routes
      const isAuthRoute = [
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
      ].some((prefix) => pathname.startsWith(prefix));
      expect(isAuthRoute, `${pathname} should not be an auth route`).toBe(false);
    }
  });

  // TC-27
  it('no sitemap URL contains [id] or [slug] dynamic segments', () => {
    for (const entry of sitemapEntries) {
      expect(entry.url).not.toContain('[');
      expect(entry.url).not.toContain(']');
    }
  });

  // TC-28
  it('no sitemap URL is a known auth-flow path', () => {
    for (const entry of sitemapEntries) {
      const pathname = new URL(entry.url).pathname;
      for (const flowPath of AUTH_FLOW_PATHS) {
        expect(pathname.startsWith(flowPath), `${pathname} should not start with ${flowPath}`).toBe(
          false
        );
      }
    }
  });

  // TC-29
  it('no duplicate URLs across sitemap entries', () => {
    const urls = sitemapEntries.map((e) => e.url);
    const uniqueUrls = new Set(urls);
    expect(uniqueUrls.size).toBe(urls.length);
  });

  // TC-30
  it('sitemap entry count matches expected public route count', () => {
    // 13 static + 2 blog + 5 careers + 3 LP = 23
    expect(sitemapEntries.length).toBeGreaterThanOrEqual(23);
    // Each entry should be unique and valid
    const urls = sitemapEntries.map((e) => new URL(e.url).pathname);
    const unique = new Set(urls);
    expect(unique.size).toBe(sitemapEntries.length);
  });

  // TC-31: PAGE_MAP_AND_FLOWS.md total page count matches filesystem
  it('PAGE_MAP_AND_FLOWS.md total count equals filesystem page count', () => {
    const pageMapPath = path.resolve(__dirname, '../../../../../docs/design/PAGE_MAP_AND_FLOWS.md');
    const content = fs.readFileSync(pageMapPath, 'utf-8');
    const match = content.match(/\|\s*Total Pages\s*\|\s*(\d+)\s*\|/);
    expect(match).toBeTruthy();
    const documentedCount = parseInt(match![1], 10);
    const pageFiles = findPageFiles(APP_DIR);
    const filesystemCount = pageFiles.length;

    if (documentedCount !== filesystemCount) {
      // Build actionable error: find which routes are in filesystem but not in doc
      const pageMapSectionMatch = content.match(
        /## Page Map by Category[\s\S]*?(?=\n## Authentication & Authorization)/
      );
      expect(pageMapSectionMatch).toBeTruthy();
      const pageMapSection = pageMapSectionMatch![0];
      const documentedRoutes = new Set(
        [...pageMapSection.matchAll(/\|\s*`?(\/(?:[A-Za-z0-9\-/[\]]*)?)`?\s*\|/g)].map(
          (m) => m[1] || '/'
        )
      );
      const missingFromDoc = pageFiles
        .map((f) => {
          const rel = path.relative(APP_DIR, f).replace(/\\/g, '/');
          // Convert file path to route: remove page.tsx, (list)/, [param] stays
          return (
            '/' +
            rel
              .replace(/\/page\.tsx$/, '')
              .replace(/\(.*?\)\//g, '')
              .replace(/\(.*?\)$/, '')
          );
        })
        .filter((route) => {
          const normalized = route.replace(/\/+$/, '') || '/';
          return !documentedRoutes.has(normalized);
        });

      const newFromDoc = [...documentedRoutes].filter(
        (route) =>
          !pageFiles.some((f) => {
            const rel = path.relative(APP_DIR, f).replace(/\\/g, '/');
            const fileRoute =
              '/' +
              rel
                .replace(/\/page\.tsx$/, '')
                .replace(/\(.*?\)\//g, '')
                .replace(/\(.*?\)$/, '');
            return fileRoute.replace(/\/+$/, '') === route.replace(/\/+$/, '');
          })
      );

      const details = [
        `PAGE_MAP_AND_FLOWS.md says ${documentedCount} pages, filesystem has ${filesystemCount}.`,
        missingFromDoc.length > 0
          ? `\n  Pages in filesystem but NOT in doc (add these to PAGE_MAP_AND_FLOWS.md):\n${missingFromDoc.map((r) => '    - ' + r).join('\n')}`
          : '',
        newFromDoc.length > 0
          ? `\n  Routes in doc but NOT in filesystem (remove or verify these):\n${newFromDoc
              .slice(0, 10)
              .map((r) => '    - ' + r)
              .join('\n')}`
          : '',
        `\n  Fix: Update docs/design/PAGE_MAP_AND_FLOWS.md Summary Statistics table and add/remove route entries.`,
      ]
        .filter(Boolean)
        .join('');

      expect.fail(details);
    }
  });

  // TC-32: page-registry.md total page count matches filesystem
  it('page-registry.md total count equals filesystem page count', () => {
    const registryPath = path.resolve(__dirname, '../../../../../docs/design/page-registry.md');
    const content = fs.readFileSync(registryPath, 'utf-8');
    const match = content.match(/\*\*Total Pages\*\*:\s*(\d+)/);
    expect(match).toBeTruthy();
    const documentedCount = parseInt(match![1], 10);
    const filesystemCount = findPageFiles(APP_DIR).length;

    if (documentedCount !== filesystemCount) {
      expect.fail(
        `page-registry.md says ${documentedCount} pages, filesystem has ${filesystemCount}.\n` +
          `  Fix: Update docs/design/page-registry.md header "Total Pages" ` +
          `and add/remove route entries to match filesystem.`
      );
    }
  });
});
