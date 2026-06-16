/**
 * Lighthouse CI — Throttled-Mobile Measurement Lane (PERF-01)
 *
 * The canonical `lighthouserc.js` runs `preset: 'desktop'` with effectively no
 * CPU/network throttling against localhost. Those conditions eliminate the JS
 * parse/eval penalty and network latency that dominate real mobile performance,
 * so the same FCP/LCP/TTI targets that FAIL prod mobile by 2.4–8x trivially pass
 * desktop/unthrottled. That ~16–17 point gap is invisible to the desktop gate.
 *
 * This lane reproduces a mid-tier mobile device (4x CPU slowdown, ~1.6 Mbps,
 * 150 ms RTT, 375x812 @2x) against the deployed Vercel preview. Every assertion
 * here is `warn` ONLY — it surfaces the mobile score in CI without ever blocking
 * a PR. Flip these to `error` once remediation (PERF-04..PERF-12) lands and the
 * numbers come down.
 *
 * Usage:
 *   CI  — `.github/workflows/pr-checks.yml` `lighthouse-mobile` job passes the
 *         bypass-enabled preview URLs via the action's `urls` input (overrides
 *         the `collect.url` list below).
 *   Local — `lhci autorun --config=./lighthouserc.mobile.js` builds + starts the
 *         web app and audits the three public localhost routes.
 *
 * @see lighthouserc.js (desktop gate, do NOT modify it for mobile)
 * @see docs/operations/perf-remediation-handoff.md (PERF-01)
 */

module.exports = {
  ci: {
    collect: {
      // Public pages only. Authenticated routes need a puppeteerScript login and
      // are scoped to a follow-on. In CI these are overridden by the action's
      // `urls` input (bypass-enabled preview URLs); this list is for local runs.
      url: [
        'http://localhost:3000',
        'http://localhost:3000/login',
        'http://localhost:3000/pricing',
      ],

      // Warn-only measurement lane — a single run keeps CI cost low. Bump for
      // statistical stability once this flips to an error-level gate.
      numberOfRuns: 1,

      // Local only: build + start the app. CI runs against a deployed preview,
      // so skip the server-start step (mirrors lighthouserc.js).
      ...(process.env.CI
        ? {}
        : {
            startServerCommand: 'pnpm run build && pnpm run start',
            startServerReadyPattern: 'ready on',
            startServerReadyTimeout: 120000,
          }),

      settings: {
        formFactor: 'mobile',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638,
          cpuSlowdownMultiplier: 4,
        },
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 812,
          deviceScaleFactor: 2,
          disabled: false,
        },
      },
    },

    assert: {
      // No preset — only the warn-level signals we want visible. With every
      // assertion at `warn`, lhci exits 0 regardless of result, so this job
      // never fails a PR. Thresholds are the current prod-mobile reality plus
      // headroom; tighten as remediation lands.
      assertions: {
        'categories:performance': ['warn', { minScore: 0.65 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 8000 }],
        'total-blocking-time': ['warn', { maxNumericValue: 1000 }],
      },
    },

    upload: {
      // Persist raw JSON so the mobile score/LCP are inspectable per PR. The CI
      // job additionally uploads this directory as a workflow artifact.
      target: 'filesystem',
      outputDir: './artifacts/lighthouse/mobile',
    },

    wizard: {
      skip: true,
    },
  },
};
