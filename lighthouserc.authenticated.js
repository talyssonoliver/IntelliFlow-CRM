// lighthouserc.authenticated.js — PG-166 authenticated home page audit
//
// Dedicated LHCI config for auditing the authenticated view of /
// Uses a Puppeteer script to inject Supabase auth cookies before collection.
// The standard lighthouserc.js (27 URLs, unauthenticated) is left unchanged.
//
// PG-197: the URL list and output directory can be overridden for other
// authenticated routes — LHCI_URLS (comma-separated) and LHCI_OUTPUT_DIR.
// Defaults are unchanged (the authenticated home page).
const urls = process.env.LHCI_URLS
  ? process.env.LHCI_URLS.split(',')
      .map((url) => url.trim())
      .filter(Boolean)
  : ['http://localhost:3000/'];
const outputDir = process.env.LHCI_OUTPUT_DIR || './artifacts/benchmarks/home-page-lighthouse';

module.exports = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 3,
      puppeteerScript: './tools/lighthouse/lhci-auth.js',
      startServerCommand: 'pnpm --filter @intelliflow/web start',
      startServerReadyPattern: 'Starting',
      startServerReadyTimeout: 120000,
      settings: {
        preset: 'desktop',
        throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        interactive: ['error', { maxNumericValue: 1000 }], // TTI <1s (PG-166 DoD, ADR-027)
        'first-contentful-paint': ['error', { maxNumericValue: 1000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'color-contrast': 'error',
        'image-alt': 'error',
        label: 'error',
        'link-name': 'error',
      },
    },
    upload: {
      target: 'filesystem',
      outputDir,
    },
  },
};
