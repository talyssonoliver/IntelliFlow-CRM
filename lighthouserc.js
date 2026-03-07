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
      // URLs to test — all major app routes (list pages, not dynamic [id] routes)
      // Public pages
      url: [
        'http://localhost:3000', // Public landing
        'http://localhost:3000/login', // Login page
        'http://localhost:3000/signup', // Signup page
        'http://localhost:3000/pricing', // Pricing page
        // Core CRM
        'http://localhost:3000/dashboard', // Dashboard
        'http://localhost:3000/leads', // Leads list
        'http://localhost:3000/contacts', // Contacts list
        'http://localhost:3000/accounts', // Accounts list
        'http://localhost:3000/deals', // Deals/pipeline list
        'http://localhost:3000/deals/forecast', // Deals forecast
        'http://localhost:3000/tasks', // Tasks list
        'http://localhost:3000/tickets', // Tickets list
        // Communications & scheduling
        'http://localhost:3000/email', // Email client
        'http://localhost:3000/calendar', // Calendar / Appointments
        // Legal & documents
        'http://localhost:3000/cases', // Cases list
        'http://localhost:3000/documents', // Documents list
        // AI & intelligence
        'http://localhost:3000/agent-approvals', // Agent approvals hub
        'http://localhost:3000/agent-approvals/ai-review', // AI review queue
        'http://localhost:3000/agent-approvals/experiments', // Experiments
        // Analytics & governance
        'http://localhost:3000/analytics', // Analytics dashboard
        'http://localhost:3000/governance', // Governance
        'http://localhost:3000/notifications', // Notifications
        // Settings
        'http://localhost:3000/settings', // Settings hub
        'http://localhost:3000/settings/ai', // AI settings
        'http://localhost:3000/settings/team', // Team settings
        'http://localhost:3000/billing', // Billing
        // Support
        'http://localhost:3000/help-center', // Help Center index
        'http://localhost:3000/help-center/search', // Help Search
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
        'categories:accessibility': ['error', { minScore: 0.9 }],
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
        interactive: ['error', { maxNumericValue: 1000 }], // TTI <1s (ADR-027, PG-166)
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

        // Security (HTTPS checks disabled for localhost — enable in production config)
        'is-on-https': 'off',
        'redirects-http': 'off',

        // Accessibility
        'color-contrast': 'error',
        'image-alt': 'error',
        label: 'error',
        'link-name': 'error',

        // SEO
        'meta-description': 'warn',
        viewport: 'error',
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
