/**
 * Lighthouse CI Configuration for IntelliFlow CRM
 *
 * This configuration file is used by Lighthouse CI to run automated
 * performance audits in the CI/CD pipeline.
 *
 * Sprint 0 Task: ENV-015-AI - Performance Baseline Setup
 *
 * @see https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
 */

module.exports = {
  ci: {
    collect: {
      // URLs to test (adjust based on deployment environment)
      url: [
        'http://localhost:3000', // Home page
        'http://localhost:3000/dashboard', // Dashboard
        'http://localhost:3000/leads', // Leads page
        'http://localhost:3000/contacts', // Contacts page
      ],

      // Number of runs per URL (for statistical reliability)
      numberOfRuns: 3,

      // Start a local server before testing
      startServerCommand: 'pnpm run build && pnpm run start',
      startServerReadyPattern: 'ready on',
      startServerReadyTimeout: 60000, // 60 seconds

      // Chromium settings
      settings: {
        preset: 'desktop', // or 'mobile' for mobile testing
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
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
      // Assertion levels: 'off' | 'warn' | 'error'
      preset: 'lighthouse:recommended',

      assertions: {
        // Categories (Sprint Plan requirement: Lighthouse score >90)
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],

        // Core Web Vitals (Sprint Plan requirements)
        'first-contentful-paint': ['error', { maxNumericValue: 1000 }], // FCP <1s
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }], // LCP <2.5s
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }], // CLS <0.1
        'total-blocking-time': ['warn', { maxNumericValue: 300 }], // TBT <300ms
        'max-potential-fid': ['error', { maxNumericValue: 100 }], // FID <100ms

        // Additional performance metrics
        'speed-index': ['warn', { maxNumericValue: 3000 }],
        'interactive': ['warn', { maxNumericValue: 3500 }],
        'first-meaningful-paint': ['warn', { maxNumericValue: 1500 }],

        // Server response time (Sprint Plan: API <200ms)
        'server-response-time': ['error', { maxNumericValue: 200 }],

        // Resource budgets
        'resource-summary:script:size': ['error', { maxNumericValue: 307200 }], // 300KB
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 51200 }], // 50KB
        'resource-summary:image:size': ['warn', { maxNumericValue: 512000 }], // 500KB
        'resource-summary:font:size': ['warn', { maxNumericValue: 102400 }], // 100KB
        'resource-summary:total:size': ['error', { maxNumericValue: 1024000 }], // 1MB
        'resource-summary:third-party:size': ['warn', { maxNumericValue: 204800 }], // 200KB

        // Best practices
        'uses-long-cache-ttl': 'warn',
        'uses-optimized-images': 'warn',
        'uses-text-compression': 'warn',
        'uses-responsive-images': 'warn',
        'offscreen-images': 'warn',
        'unminified-css': 'error',
        'unminified-javascript': 'error',
        'unused-css-rules': 'warn',
        'unused-javascript': 'warn',
        'modern-image-formats': 'warn',
        'uses-rel-preconnect': 'warn',
        'font-display': 'warn',

        // Security
        'is-on-https': 'error',
        'redirects-http': 'warn',

        // Accessibility
        'color-contrast': 'warn',
        'image-alt': 'warn',
        'label': 'warn',
        'link-name': 'warn',

        // SEO
        'meta-description': 'warn',
        'viewport': 'error',
      },
    },

    upload: {
      // Store results in temporary storage (for local development)
      target: 'temporary-public-storage',

      // Alternatively, use filesystem storage for CI
      // target: 'filesystem',
      // outputDir: './artifacts/lighthouse',

      // Or configure Lighthouse CI server
      // target: 'lhci',
      // serverBaseUrl: 'https://your-lhci-server.com',
      // token: process.env.LHCI_TOKEN,
    },

    server: {
      // Configuration for Lighthouse CI server (optional)
      // port: 9001,
      // storage: {
      //   storageMethod: 'sql',
      //   sqlDialect: 'postgres',
      //   sqlConnectionUrl: process.env.DATABASE_URL,
      // },
    },

    wizard: {
      // Skip wizard in CI environment
      skip: true,
    },
  },

  // Performance budgets (loaded from separate config)
  budgets: require('./infra/monitoring/performance-budgets.json').budgets,
};
