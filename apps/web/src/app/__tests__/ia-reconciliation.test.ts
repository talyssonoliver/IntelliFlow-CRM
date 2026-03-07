/**
 * Tests for information-architecture.md reconciliation against codebase reality
 * Ensures the unified IA reference stays in sync with the filesystem and source docs
 * Covers: AC-009 (DOC-006)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPageFiles } from './test-helpers/ia-fs-helpers';

const APP_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.resolve(__dirname, '../../../../../docs/design');
const IA_PATH = path.join(DOCS_DIR, 'information-architecture.md');
const ROUTER_PATH = path.resolve(__dirname, '../../../../../apps/api/src/router.ts');

describe('information-architecture.md Reconciliation', () => {
  let iaContent: string;
  /** Header text with blockquote line-continuations collapsed into single line */
  let normalizedHeader: string;

  beforeAll(() => {
    iaContent = fs.readFileSync(IA_PATH, 'utf-8');
    normalizedHeader = iaContent.replace(/\n>\s*/g, ' ');
  });

  // TC-IA-01: Total Pages matches filesystem count
  it('Total Pages count matches filesystem page.tsx count', () => {
    const match = normalizedHeader.match(/\*\*Total Pages\*\*:\s*(\d+)/);
    expect(
      match,
      'Could not find **Total Pages**: N in information-architecture.md header'
    ).toBeTruthy();
    const documentedCount = parseInt(match![1], 10);
    const filesystemCount = findPageFiles(APP_DIR).length;

    if (documentedCount !== filesystemCount) {
      expect.fail(
        `information-architecture.md header says ${documentedCount} Total Pages, ` +
          `filesystem has ${filesystemCount} page.tsx files.\n` +
          `  Fix: Update the "Total Pages" value in docs/design/information-architecture.md header to ${filesystemCount}.`
      );
    }
  });

  // TC-IA-03: API Router count matches router.ts registrations
  it('API Router count matches router.ts registrations', () => {
    const match = normalizedHeader.match(/\*\*API\s*Routers\*\*:\s*(\d+)/);
    expect(
      match,
      'Could not find **API Routers**: N in information-architecture.md header'
    ).toBeTruthy();
    const documentedRouterCount = parseInt(match![1], 10);

    const routerContent = fs.readFileSync(ROUTER_PATH, 'utf-8');
    const routerBlock = routerContent.match(/createTRPCRouter\(\{([\s\S]*?)\}\)/);
    expect(routerBlock, 'Could not find createTRPCRouter({...}) block in router.ts').toBeTruthy();

    // Count key: valueRouter entries (skip comment-only and blank lines)
    const entries = routerBlock![1].match(/^\s+\w+:\s+\w+,?\s*(\/\/.*)?$/gm) || [];
    const actualRouterCount = entries.length;

    if (documentedRouterCount !== actualRouterCount) {
      expect.fail(
        `information-architecture.md header says ${documentedRouterCount} API routers, ` +
          `router.ts has ${actualRouterCount} registrations.\n` +
          `  Fix: Update docs/design/information-architecture.md header "API Routers" value to ${actualRouterCount}.`
      );
    }
  });

  // TC-IA-04: Cross-doc consistency (5 docs agree on Total Pages)
  it('all 5 design docs agree on Total Pages count', () => {
    const docs: Array<{ name: string; path: string; count: number }> = [];

    // 1. information-architecture.md — blockquote header
    const iaMatch = normalizedHeader.match(/\*\*Total Pages\*\*:\s*(\d+)/);
    expect(iaMatch, 'Missing Total Pages in information-architecture.md').toBeTruthy();
    docs.push({
      name: 'information-architecture.md',
      path: IA_PATH,
      count: parseInt(iaMatch![1], 10),
    });

    // 2. page-registry.md — bold header
    const registryPath = path.join(DOCS_DIR, 'page-registry.md');
    const registryContent = fs.readFileSync(registryPath, 'utf-8');
    const registryMatch = registryContent.match(/\*\*Total Pages\*\*:\s*(\d+)/);
    expect(registryMatch, 'Missing Total Pages in page-registry.md').toBeTruthy();
    docs.push({
      name: 'page-registry.md',
      path: registryPath,
      count: parseInt(registryMatch![1], 10),
    });

    // 3. ui-flow-mapping.md — blockquote header (normalize line breaks)
    const uifPath = path.join(DOCS_DIR, 'ui-flow-mapping.md');
    const uifContent = fs.readFileSync(uifPath, 'utf-8');
    const uifNormalized = uifContent.replace(/\n>\s*/g, ' ');
    const uifMatch = uifNormalized.match(/\*\*Total Pages\*\*:\s*(\d+)/);
    expect(uifMatch, 'Missing Total Pages in ui-flow-mapping.md').toBeTruthy();
    docs.push({ name: 'ui-flow-mapping.md', path: uifPath, count: parseInt(uifMatch![1], 10) });

    // 4. sitemap.md — blockquote header (normalize line breaks)
    const sitemapPath = path.join(DOCS_DIR, 'sitemap.md');
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');
    const sitemapNormalized = sitemapContent.replace(/\n>\s*/g, ' ');
    const sitemapMatch = sitemapNormalized.match(/\*\*Total Pages\*\*:\s*(\d+)/);
    expect(sitemapMatch, 'Missing Total Pages in sitemap.md').toBeTruthy();
    docs.push({ name: 'sitemap.md', path: sitemapPath, count: parseInt(sitemapMatch![1], 10) });

    // 5. PAGE_MAP_AND_FLOWS.md — table row format
    const pmfPath = path.join(DOCS_DIR, 'PAGE_MAP_AND_FLOWS.md');
    const pmfContent = fs.readFileSync(pmfPath, 'utf-8');
    const pmfMatch = pmfContent.match(/\|\s*Total Pages\s*\|\s*(\d+)\s*\|/);
    expect(pmfMatch, 'Missing Total Pages in PAGE_MAP_AND_FLOWS.md').toBeTruthy();
    docs.push({ name: 'PAGE_MAP_AND_FLOWS.md', path: pmfPath, count: parseInt(pmfMatch![1], 10) });

    // All 5 should agree
    const counts = docs.map((d) => d.count);
    const unique = new Set(counts);
    if (unique.size !== 1) {
      const details = docs.map((d) => `  ${d.name}: ${d.count}`).join('\n');
      expect.fail(
        `Total Pages count disagrees across documents:\n${details}\n` +
          `  Fix: Update all documents to use the filesystem-canonical count (${findPageFiles(APP_DIR).length}).`
      );
    }
  });

  // TC-IA-05: Ghost link regression (ghost routes must NOT have page.tsx)
  it('ghost link routes do not have page.tsx on disk', () => {
    // Extract §4 Ghost Links Register section
    const ghostSection = iaContent.match(/## 4\.\s*Ghost Links Register[\s\S]*?(?=\n## \d|$)/);
    expect(ghostSection, 'Could not find "## 4. Ghost Links Register" section').toBeTruthy();

    // Extract target URLs from ghost link rows: | G-NN | ... | ... | `/<route>` | ...
    const ghostUrls: string[] = [];
    const rowRegex = /\|\s*G-\d+\s*\|[^|]*\|[^|]*\|\s*`([^`]+)`\s*\|/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(ghostSection![0])) !== null) {
      ghostUrls.push(rowMatch[1]);
    }

    expect(
      ghostUrls.length,
      'No ghost link URLs found — table format may have changed'
    ).toBeGreaterThan(0);

    // Build normalized route set from page.tsx files
    const pageFiles = findPageFiles(APP_DIR);
    const routeSet = new Set(
      pageFiles.map((f) => {
        const rel = path.relative(APP_DIR, f).replace(/\\/g, '/');
        return (
          '/' +
          rel
            .replace(/\/page\.tsx$/, '')
            .replace(/\(.*?\)\//g, '')
            .replace(/\(.*?\)$/, '')
        );
      })
    );

    // Ghost routes must NOT appear in the filesystem route set
    const resolvedGhosts = ghostUrls.filter((url) => {
      const normalized = url.replace(/\/+$/, '') || '/';
      return routeSet.has(normalized);
    });

    if (resolvedGhosts.length > 0) {
      expect.fail(
        `${resolvedGhosts.length} ghost link(s) now have page.tsx on disk (remove from Ghost Links Register):\n` +
          resolvedGhosts.map((r) => `  - ${r}`).join('\n')
      );
    }
  });
});
