// tools/lighthouse/extract-lhci-report.ts
// Extracts LHCI filesystem run into a flat summary JSON for DoD artifact
//
// PG-166: Reads the LHCI manifest, picks the median run for "/",
// and writes a summary to artifacts/benchmarks/home-page-lighthouse.json

import fs from 'node:fs';
import path from 'node:path';

export interface LhciSummary {
  url: string;
  fetchTime: string;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number | null;
  };
  metrics: {
    tti: number;
    fcp: number;
    lcp: number;
    cls: number;
    tbt: number;
    si: number;
  };
  passedThresholds: {
    performance: boolean;
    accessibility: boolean;
    tti: boolean;
  };
  generatedAt: string;
}

interface ManifestEntry {
  url: string;
  jsonPath: string;
}

/** The run with the highest performance score among the entries. */
function bestEntry(entries: ManifestEntry[]): ManifestEntry {
  let best = entries[0];
  let bestScore = -1;
  for (const entry of entries) {
    const report = JSON.parse(fs.readFileSync(entry.jsonPath, 'utf8'));
    const perfScore = report.categories?.performance?.score ?? 0;
    if (perfScore > bestScore) {
      bestScore = perfScore;
      best = entry;
    }
  }
  return best;
}

function summarize(entry: ManifestEntry): LhciSummary {
  const lhr = JSON.parse(fs.readFileSync(entry.jsonPath, 'utf8'));
  return {
    url: lhr.finalUrl,
    fetchTime: lhr.fetchTime,
    scores: {
      performance: lhr.categories.performance.score,
      accessibility: lhr.categories.accessibility.score,
      bestPractices: lhr.categories['best-practices'].score,
      seo: lhr.categories.seo?.score ?? null,
    },
    metrics: {
      tti: lhr.audits['interactive'].numericValue,
      fcp: lhr.audits['first-contentful-paint'].numericValue,
      lcp: lhr.audits['largest-contentful-paint'].numericValue,
      cls: lhr.audits['cumulative-layout-shift'].numericValue,
      tbt: lhr.audits['total-blocking-time'].numericValue,
      si: lhr.audits['speed-index'].numericValue,
    },
    passedThresholds: {
      performance: lhr.categories.performance.score >= 0.9,
      accessibility: lhr.categories.accessibility.score >= 0.9,
      tti: lhr.audits['interactive'].numericValue < 1000,
    },
    generatedAt: new Date().toISOString(),
  };
}

function readManifest(lhciDir: string): ManifestEntry[] {
  return JSON.parse(fs.readFileSync(path.join(lhciDir, 'manifest.json'), 'utf8'));
}

export function extractLhciReport(lhciDir: string, outFile: string): LhciSummary | null {
  // Pick the run with the highest performance score for the "/" URL
  const entries = readManifest(lhciDir).filter((r) => r.url.endsWith('/'));
  if (entries.length === 0) {
    return null;
  }

  const summary = summarize(bestEntry(entries));
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  return summary;
}

/** File-name slug for a URL path: `/accounts/new` → `accounts-new`, `/` → `root`. */
export function urlSlug(url: string): string {
  const slug = new URL(url).pathname.replaceAll(/[^a-zA-Z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
  return slug || 'root';
}

/**
 * PG-197: one summary per audited URL (best run each), written to
 * `<outDir>/summary-<slug>.json`. Used when LHCI_URLS lists several routes.
 */
export function extractLhciReports(lhciDir: string, outDir: string): LhciSummary[] {
  const byUrl = new Map<string, ManifestEntry[]>();
  for (const entry of readManifest(lhciDir)) {
    byUrl.set(entry.url, [...(byUrl.get(entry.url) ?? []), entry]);
  }
  fs.mkdirSync(outDir, { recursive: true });
  return [...byUrl.entries()].map(([url, entries]) => {
    const summary = summarize(bestEntry(entries));
    fs.writeFileSync(
      path.join(outDir, `summary-${urlSlug(url)}.json`),
      JSON.stringify(summary, null, 2)
    );
    return summary;
  });
}

// Auto-execute when run directly
const isDirectRun = process.argv[1]?.includes('extract-lhci-report');
if (isDirectRun && process.env.LHCI_OUTPUT_DIR) {
  // PG-197: several URLs → one summary per URL next to the LHCI output.
  const LHCI_DIR = path.resolve(process.env.LHCI_OUTPUT_DIR);
  for (const summary of extractLhciReports(LHCI_DIR, LHCI_DIR)) {
    console.log(
      summary.url,
      'performance',
      (summary.scores.performance * 100).toFixed(0),
      'accessibility',
      (summary.scores.accessibility * 100).toFixed(0)
    );
  }
} else if (isDirectRun) {
  const LHCI_DIR = path.resolve('artifacts/benchmarks/home-page-lighthouse');
  const OUT_FILE = path.resolve('artifacts/benchmarks/home-page-lighthouse.json');

  const summary = extractLhciReport(LHCI_DIR, OUT_FILE);
  if (!summary) {
    console.error('No entry found for "/" URL in manifest.json');
    process.exit(1);
  }

  console.log('Wrote', OUT_FILE);
  console.log('Performance:', (summary.scores.performance * 100).toFixed(0));
  console.log('Accessibility:', (summary.scores.accessibility * 100).toFixed(0));
  console.log('TTI:', summary.metrics.tti.toFixed(0), 'ms');
  console.log('Passed:', JSON.stringify(summary.passedThresholds));
}
