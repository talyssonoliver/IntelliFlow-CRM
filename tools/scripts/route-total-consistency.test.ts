/**
 * Cross-doc canonical-total consistency regression test (DOC-015).
 *
 * Asserts that every design doc that quotes a "Total Pages / Total Routes /
 * page.tsx entries / filesystem total" value cites the canonical filesystem
 * total returned by `runAudit()` from `./content-audit.ts`.
 *
 * Sibling-pattern reference: `tools/scripts/a11y-route-reconcile.test.ts`.
 *
 * Test oracle: `runAudit(REPO_ROOT).summary.total_routes` (live filesystem
 * scan). The canonical number is NEVER hardcoded — when routes are added,
 * this test self-updates and surfaces drift in the docs.
 *
 * @module tools/scripts/route-total-consistency.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAudit } from './content-audit.js';

const REPO_ROOT = resolve(__dirname, '../..');

const DOCS = [
  'docs/design/sitemap.md',
  'docs/design/page-registry.md',
  'docs/design/PAGE_MAP_AND_FLOWS.md',
  'docs/design/ui-flow-mapping.md',
  'docs/design/navigation-reachability-audit.md',
  'docs/design/information-architecture.md',
  'docs/design/content-audit.md',
] as const;

describe('DOC-015 — design-doc canonical totals are in sync with filesystem', () => {
  const canonical = runAudit(REPO_ROOT).summary.total_routes;

  it('audit produced a positive route count', () => {
    expect(canonical).toBeGreaterThan(0);
  });

  for (const rel of DOCS) {
    it(`${rel} cites the canonical total (${canonical})`, () => {
      const path = resolve(REPO_ROOT, rel);
      expect(existsSync(path), `missing doc: ${rel}`).toBe(true);
      const text = readFileSync(path, 'utf-8');
      const phrases = ['Total Pages', 'Total Routes', 'page\\.tsx entries', 'filesystem total'];
      const pattern = new RegExp(`(${phrases.join('|')})[^\\n]{0,160}\\b${canonical}\\b`);
      const hasCanonical = pattern.test(text);
      expect(
        hasCanonical,
        `${rel} does not cite canonical ${canonical} on any "Total Pages|Total Routes|page.tsx entries|filesystem total" line`
      ).toBe(true);
    });

    it(`${rel} carries a "Canonical counts" admonition`, () => {
      const path = resolve(REPO_ROOT, rel);
      const text = readFileSync(path, 'utf-8');
      expect(/Canonical counts/.test(text), `${rel} missing canonical-counts admonition`).toBe(
        true
      );
    });
  }
});
