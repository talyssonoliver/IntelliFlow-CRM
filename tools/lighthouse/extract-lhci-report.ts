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

export function extractLhciReport(lhciDir: string, outFile: string): LhciSummary | null {
  const manifest = JSON.parse(fs.readFileSync(path.join(lhciDir, 'manifest.json'), 'utf8'));

  // Pick the run with the highest performance score for the "/" URL
  const entries = manifest.filter((r: { url: string }) => r.url.endsWith('/'));
  if (entries.length === 0) {
    return null;
  }

  let bestEntry = entries[0];
  let bestScore = -1;
  for (const entry of entries) {
    const report = JSON.parse(fs.readFileSync(entry.jsonPath, 'utf8'));
    const perfScore = report.categories?.performance?.score ?? 0;
    if (perfScore > bestScore) {
      bestScore = perfScore;
      bestEntry = entry;
    }
  }

  const lhr = JSON.parse(fs.readFileSync(bestEntry.jsonPath, 'utf8'));

  const summary: LhciSummary = {
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

  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  return summary;
}

// Auto-execute when run directly
const isDirectRun = process.argv[1]?.includes('extract-lhci-report');
if (isDirectRun) {
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
