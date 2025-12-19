/**
 * Lighthouse Configuration for IntelliFlow CRM
 *
 * Defines performance testing parameters and thresholds for Lighthouse audits.
 * Used by Lighthouse CI to validate performance budgets during CI/CD pipeline.
 *
 * @see https://github.com/GoogleChrome/lighthouse/blob/main/docs/configuration.md
 */

module.exports = {
  extends: 'lighthouse:default',

  settings: {
    // Emulate mobile device for performance testing
    formFactor: 'mobile',
    throttling: {
      rttMs: 150,
      throughputKbps: 1.6 * 1024,
      requestLatencyMs: 150,
      downloadThroughputKbps: 1.6 * 1024,
      uploadThroughputKbps: 750,
      cpuSlowdownMultiplier: 4,
    },
    screenEmulation: {
      mobile: true,
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      disabled: false,
    },
    emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  },

  // Specify which audits to run
  audits: [
    'first-contentful-paint',
    'largest-contentful-paint',
    'first-meaningful-paint',
    'speed-index',
    'interactive',
    'total-blocking-time',
    'cumulative-layout-shift',
    'max-potential-fid',
    'server-response-time',
    'redirects',
    'user-timings',
    'network-requests',
    'network-rtt',
    'network-server-latency',
    'main-thread-tasks',
    'bootup-time',
    'uses-optimized-images',
    'uses-responsive-images',
    'offscreen-images',
    'unminified-css',
    'unminified-javascript',
    'unused-css-rules',
    'unused-javascript',
    'modern-image-formats',
    'uses-text-compression',
    'uses-rel-preconnect',
    'font-display',
    'third-party-summary',
  ],

  // Categories and their weights
  categories: {
    performance: {
      title: 'Performance',
      auditRefs: [
        { id: 'first-contentful-paint', weight: 10, group: 'metrics' },
        { id: 'largest-contentful-paint', weight: 25, group: 'metrics' },
        { id: 'total-blocking-time', weight: 30, group: 'metrics' },
        { id: 'cumulative-layout-shift', weight: 15, group: 'metrics' },
        { id: 'speed-index', weight: 10, group: 'metrics' },
        { id: 'interactive', weight: 10, group: 'metrics' },
      ],
    },
  },

  // Performance budgets (aligned with Sprint Plan requirements)
  budgets: [
    {
      resourceType: 'document',
      budget: 18, // 18 KB for HTML
    },
    {
      resourceType: 'script',
      budget: 300, // 300 KB for JavaScript
    },
    {
      resourceType: 'stylesheet',
      budget: 50, // 50 KB for CSS
    },
    {
      resourceType: 'image',
      budget: 500, // 500 KB for images
    },
    {
      resourceType: 'font',
      budget: 100, // 100 KB for fonts
    },
    {
      resourceType: 'total',
      budget: 1000, // 1000 KB total page weight
    },
    {
      resourceType: 'third-party',
      budget: 200, // 200 KB for third-party resources
    },
  ],

  // Timing budgets (aligned with performance targets)
  timingBudgets: [
    {
      metric: 'first-contentful-paint',
      budget: 1000, // 1s - Sprint Plan target: FCP <1s
    },
    {
      metric: 'largest-contentful-paint',
      budget: 2500, // 2.5s - Sprint Plan target: LCP <2.5s
    },
    {
      metric: 'interactive',
      budget: 3500, // 3.5s - Time to Interactive
    },
    {
      metric: 'first-meaningful-paint',
      budget: 1500, // 1.5s
    },
    {
      metric: 'speed-index',
      budget: 3000, // 3s
    },
    {
      metric: 'total-blocking-time',
      budget: 300, // 300ms
    },
    {
      metric: 'max-potential-fid',
      budget: 100, // 100ms - Sprint Plan target: FID <100ms
    },
    {
      metric: 'cumulative-layout-shift',
      budget: 0.1, // CLS score
    },
  ],

  // Assertion thresholds for CI/CD
  assertions: {
    'categories:performance': ['warn', { minScore: 0.9 }], // Lighthouse score >90
    'categories:accessibility': ['warn', { minScore: 0.9 }],
    'categories:best-practices': ['warn', { minScore: 0.9 }],
    'categories:seo': ['warn', { minScore: 0.9 }],

    // Core Web Vitals
    'first-contentful-paint': ['error', { maxNumericValue: 1000 }], // 1s
    'largest-contentful-paint': ['error', { maxNumericValue: 2500 }], // 2.5s
    'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }], // 0.1
    'total-blocking-time': ['warn', { maxNumericValue: 300 }], // 300ms
    'max-potential-fid': ['error', { maxNumericValue: 100 }], // 100ms - FID target

    // Additional performance metrics
    'speed-index': ['warn', { maxNumericValue: 3000 }],
    'interactive': ['warn', { maxNumericValue: 3500 }],
    'server-response-time': ['warn', { maxNumericValue: 200 }], // API <200ms target
  },

  // Output configuration
  output: ['json', 'html'],
  outputPath: './artifacts/benchmarks/',
};
