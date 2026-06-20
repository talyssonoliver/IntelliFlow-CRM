import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Authenticated "Journey" specs — these require a logged-in session, so they run
 * under the `authenticated` project (default ENTERPRISE storageState) instead of
 * the unauthenticated `chromium` project. Unauthenticated flows (auth-flow,
 * signup, mfa login, smoke, icons, inbound webhook) deliberately stay on chromium.
 */
const AUTHED_SPECS = [
  '**/agent-approvals.spec.ts',
  '**/ai-features/**/*.spec.ts',
  '**/case-timeline.spec.ts',
  '**/contact-crud.spec.ts',
  '**/forms.spec.ts',
  '**/home/**/*.spec.ts',
  '**/navigation.spec.ts',
  '**/pipeline-settings.spec.ts',
  '**/tasks.spec.ts',
  '**/workflow-builder.spec.ts',
];

/**
 * The auth fixture (setup) + authenticated project need Supabase-admin + a test
 * DB. When that env is absent (e.g. a CI job without the QA secrets) we omit both
 * projects entirely: the authed specs are already excluded from `chromium`, so
 * they simply don't run there instead of failing the setup dependency. Wire the
 * env (see e2e-auth-fixture-and-qa-matrix.md) to enable the authenticated suite.
 */
const HAS_QA_ENV = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL)
);

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
  // Local gets 1 retry: the authenticated suite runs against `next dev`, whose
  // on-demand route compilation + client auth bootstrap occasionally leaves a
  // freshly-navigated page blank past the assertion window under parallel load.
  // That is an environmental cold-start flake (the page renders fine warm / in a
  // prod build), so a single retry keeps the suite trustworthy without masking
  // real failures — a genuinely broken assertion fails on the retry too. Pair
  // with a constrained worker count locally (e.g. `--workers=2`) for the heavy
  // authed/journey specs. 2 retries (matching CI): the heaviest SSR pages
  // (/leads, /leads/new prefetch server-side) blank often enough on a cold dev
  // server that one retry isn't always sufficient. The definitive fix is running
  // the authed suite against a prod `next build`/`start` (no on-demand compile).
  retries: 2,
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
      locale: 'en-GB',

      // Timezone
      timezoneId: 'America/New_York',
    },
  },

  // Configure projects for different browsers and devices
  // Following Testing Pyramid: Project-level filtering reduces test bloat
  projects: [
    // Auth + seed SETUP project + the authenticated QA suite. Only present when
    // the QA env is wired (HAS_QA_ENV) — otherwise omitted so CI without the
    // secrets stays green (the authed specs are excluded from chromium below).
    ...(HAS_QA_ENV
      ? [
          // Provisions the QA persona matrix (tiers × tenants × industries) and
          // writes an authenticated storageState per persona. Run with:
          //   npx dotenv -e $TEMP/api-localb.env -- playwright test --project=setup
          {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
          },
          // Authenticated QA matrix + migrated Journey specs. Each matrix spec
          // picks its persona via test.use({ storageState }); the default below is
          // the all-modules ENTERPRISE user.
          {
            name: 'authenticated',
            testMatch: ['**/matrix/**/*.spec.ts', ...AUTHED_SPECS],
            dependencies: ['setup'],
            // Generous per-test budget: a cold `next dev` route compile plus the
            // client auth bootstrap can push first-paint past the 30s default.
            timeout: 60 * 1000,
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'tests/e2e/.auth/enterprise.json',
              launchOptions: { args: ['--disable-dev-shm-usage'] },
            },
          },
        ]
      : []),

    // Desktop Browsers - Full suite on Chromium (baseline)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-dev-shm-usage'],
        },
      },
      // Chromium runs the UNAUTHENTICATED specs (auth-flow, signup, mfa, smoke,
      // icons, inbound webhook). The auth setup, matrix, and authenticated Journey
      // specs run under their own projects above.
      testIgnore: ['**/auth.setup.ts', '**/matrix/**', ...AUTHED_SPECS],
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
  // CI: the upstream `build` job has already produced `apps/web/.next` and
  // uploaded it as the `build-output` artifact; the E2E job downloads it
  // into the workspace before this command runs. Re-running `pnpm run build`
  // inside webServer kept the turbo task graph busy for >5min (it never
  // even reached `apps/web` before the previous 300s timeout fired —
  // verified in run 26548719622 logs). Just `next start` against the
  // pre-built `.next` directory.
  //
  // Dev: keep `pnpm run dev` for the local watch experience.
  webServer: {
    command: process.env.CI ? 'pnpm --filter @intelliflow/web start' : 'pnpm run dev',
    url: process.env.E2E_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // 180s is comfortable for `next start` cold boot on a GH Actions
    // ubuntu-latest runner; the previous 300s was sized for the
    // (broken) `build && start` path and is no longer needed.
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
      NEXT_PUBLIC_API_URL: process.env.E2E_BASE_URL || 'http://localhost:3000',
      // #278: the web app's module-init guard hard-fails `next start` (prod mode)
      // unless NEXT_PUBLIC_APP_URL is set, so the E2E webServer refused to boot and
      // every spec failed. Provide it to the webServer process.
      NEXT_PUBLIC_APP_URL: process.env.E2E_BASE_URL || 'http://localhost:3000',
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
    // Default assertion timeout. Bumped from 5s because heavy SSR pages under
    // `next dev` (notably /leads, which prefetches server-side) can take >10s to
    // paint on a cold compile — the markup is correct, just slow. Prod
    // (`next build`/`start`) renders these fast; this only pads the local dev run.
    timeout: 15 * 1000,

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
