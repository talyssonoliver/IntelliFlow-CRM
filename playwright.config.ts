import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright E2E Testing Configuration for IntelliFlow CRM
 *
 * This configuration enables comprehensive end-to-end testing with:
 * - Multi-browser support (Chromium, Firefox, WebKit)
 * - Mobile device emulation
 * - Visual regression testing
 * - Parallel test execution
 * - Video and screenshot capture on failure
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Test file pattern
  testMatch: '**/*.spec.ts',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  // Consolidated to artifacts/misc/playwright-report/ (matches Sprint_plan.json artifact path)
  reporter: [
    ['html', { outputFolder: 'artifacts/misc/playwright-report' }],
    ['json', { outputFile: 'artifacts/test-results/playwright-results.json' }],
    ['junit', { outputFile: 'artifacts/test-results/playwright-junit.xml' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Action timeout
    actionTimeout: 10 * 1000,

    // Navigation timeout
    navigationTimeout: 30 * 1000,

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors in development
    ignoreHTTPSErrors: true,

    // Browser context options
    contextOptions: {
      // Permissions
      permissions: [],

      // Locale
      locale: 'en-US',

      // Timezone
      timezoneId: 'America/New_York',
    },
  },

  // Configure projects for different browsers and devices
  // Following Testing Pyramid: Project-level filtering reduces test bloat
  projects: [
    // Desktop Browsers - Full suite on Chromium (baseline)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-dev-shm-usage'],
        },
      },
      // Chromium runs ALL tests including VRT (baseline browser)
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        actionTimeout: 15 * 1000,
        navigationTimeout: 45 * 1000,
      },
      timeout: 60 * 1000,
      // Exclude VRT and mobile-specific tests
      testIgnore: ['**/*.vrt.spec.ts', '**/*.mobile.spec.ts'],
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      // Exclude VRT and mobile-specific tests
      testIgnore: ['**/*.vrt.spec.ts', '**/*.mobile.spec.ts'],
    },

    // Mobile Browsers - Only mobile-specific + smoke tests
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      // Only run mobile-specific tests and smoke tests
      testMatch: ['**/*.mobile.spec.ts', '**/smoke.spec.ts'],
    },

    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      // Only run mobile-specific tests and smoke tests
      testMatch: ['**/*.mobile.spec.ts', '**/smoke.spec.ts'],
    },

    // Tablet - Only tablet-specific + smoke tests
    {
      name: 'tablet',
      use: { ...devices['iPad Pro'] },
      // Only run tablet-specific tests and smoke tests
      testMatch: ['**/*.tablet.spec.ts', '**/smoke.spec.ts'],
    },
  ],

  // Web Server configuration
  // Automatically start the dev server before running tests
  webServer: {
    command: process.env.CI ? 'pnpm run build && pnpm run start' : 'pnpm run dev',
    url: process.env.E2E_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
      NEXT_PUBLIC_API_URL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    },
  },

  // Global setup and teardown
  globalSetup: path.join(__dirname, 'tests/e2e/global-setup.ts'),
  globalTeardown: path.join(__dirname, 'tests/e2e/global-teardown.ts'),

  // Output folder for test artifacts (screenshots, videos, traces)
  // Consolidated under artifacts/misc/playwright-output/
  outputDir: 'artifacts/misc/playwright-output',

  // Snapshot path template
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',

  // Expect configuration
  expect: {
    // Maximum time expect() should wait for the condition to be met
    timeout: 5 * 1000,

    toHaveScreenshot: {
      // Maximum time to wait for screenshot to be taken
      timeout: 10 * 1000,

      // Acceptable pixel ratio difference
      maxDiffPixelRatio: 0.01,

      // Animation handling
      animations: 'disabled',
    },

    toMatchSnapshot: {
      // Acceptable pixel ratio difference for snapshots
      maxDiffPixelRatio: 0.01,
    },
  },
});
