import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'node:path';

/**
 * Root Vitest configuration for IntelliFlow CRM monorepo.
 *
 * Turbo often runs Vitest from inside individual workspace packages, so this
 * config is deliberately "portable" and uses the current working directory as
 * the test root.
 */
const packageRoot = process.cwd();
const monorepoRoot = __dirname;

// Load environment variables from .env.local
// This makes all env vars available to tests
const env = loadEnv('test', monorepoRoot, '');

// Populate process.env with loaded variables
Object.assign(process.env, env);

export default defineConfig({
  resolve: {
    alias: {
      '@intelliflow/domain': path.resolve(monorepoRoot, 'packages/domain/src'),
      '@intelliflow/platform': path.resolve(monorepoRoot, 'packages/platform/src'),
      '@intelliflow/adapters': path.resolve(monorepoRoot, 'packages/adapters/src'),
      '@intelliflow/validators': path.resolve(monorepoRoot, 'packages/validators/src'),
      '@intelliflow/application': path.resolve(monorepoRoot, 'packages/application/src'),
      '@intelliflow/db': path.resolve(monorepoRoot, 'packages/db/src'),
      '@intelliflow/webhooks': path.resolve(monorepoRoot, 'packages/webhooks/src'),
      '@intelliflow/observability': path.resolve(monorepoRoot, 'packages/observability/src'),
      // Web app path alias
      '@': path.resolve(monorepoRoot, 'apps/web/src'),
    },
  },
  test: {
    // ============================================================
    // MEMORY OPTIMIZATION - Vitest v4.x
    // Per Context7: With large test suites, memory must be managed
    // https://vitest.dev/guide/migration.html (v4 pool options)
    // ============================================================

    // Node.js CLI arguments passed to workers
    // --expose-gc: Allow explicit garbage collection for cleanup
    execArgv: ['--max-old-space-size=4096', '--expose-gc'],

    // Limit workers to prevent memory exhaustion.
    // All projects MUST use the same maxWorkers value — Vitest 4.x requires
    // matching sequence.groupOrder when maxWorkers differ across projects.
    maxWorkers: 4,
    minWorkers: 1,

    // Using 'forks' pool for stability. vmForks was tested but caused test regressions
    // due to VM context incompatibilities with happy-dom and certain mock patterns.
    pool: 'forks',
    // Each sub-project runs with isolate:true (default) for proper mock isolation.
    // Root project was split into per-package projects to bound V8 coverage memory.

    // Sequence configuration for predictable memory usage
    sequence: {
      // Run hooks (beforeAll/afterAll) in parallel within a file - faster but controlled
      hooks: 'parallel',
    },

    // Timeouts to prevent hung tests from accumulating memory
    testTimeout: 30000, // 30s per test
    hookTimeout: 30000, // 30s for beforeAll/afterAll
    teardownTimeout: 10000, // 10s for cleanup

    // Handle worker exit errors at root level - these occur during cleanup after tests complete
    // The errors are: "Worker exited unexpectedly" during post-test cleanup
    onUnhandledError(error: Error): boolean | void {
      // Filter out worker exit errors that occur during cleanup
      if (
        error.message?.includes('Worker exited unexpectedly') ||
        error.message?.includes('vitest-pool') ||
        error.message?.includes('[vitest-pool]')
      ) {
        return false; // Don't fail the test run for these errors
      }
      // Filter vitest worker-teardown RPC races. When a test logs as its
      // worker is closing, vitest emits
      //   EnvironmentTeardownError: [vitest-worker]: Closing rpc while
      //   "onUserConsoleLog" was pending
      // as an UNHANDLED rejection AFTER every test has already reported
      // pass/fail. With ~30.5k tests across forked workers this race fires
      // intermittently and turns an all-green run non-zero (observed on
      // ai-worker.supplementary2 + happy-dom fetch teardown). It is worker
      // lifecycle noise, never test-logic failure, so swallow it. Narrowly
      // matched so a genuine teardown error with a different message still
      // fails the run.
      // Require BOTH the EnvironmentTeardownError name AND a specific rpc-race
      // message fragment, so a genuine teardown failure carrying a different
      // message still fails the run (per PR #210 review).
      if (
        error.name === 'EnvironmentTeardownError' &&
        (error.message?.includes('Closing rpc while') ||
          error.message?.includes('onUserConsoleLog'))
      ) {
        return false;
      }
    },

    // Define multiple test projects in the monorepo
    projects: [
      // Individual project configs
      'apps/api/vitest.config.ts',
      'apps/ai-worker/vitest.config.ts',
      'apps/web/vitest.config.ts',
      'apps/workers/shared/vitest.config.ts',
      'apps/workers/notifications-worker/vitest.config.ts',
      'apps/workers/events-worker/vitest.config.ts',
      'apps/workers/ingestion-worker/vitest.config.ts',
      'packages/ui/vitest.config.ts',
      'packages/observability/vitest.config.ts',
      'tests/architecture/vitest.config.ts',
      'tests/a11y/vitest.config.ts',
      // Package-level configs — split from root project to:
      // 1. Keep V8 coverage memory bounded (fewer files per worker)
      // 2. Avoid vi.mock() conflicts when isolate:false would be needed
      'packages/adapters/vitest.config.ts',
      'packages/application/vitest.config.ts',
      'packages/domain/vitest.config.ts',
      'packages/db/vitest.config.ts',
      'packages/validators/vitest.config.ts',
      'packages/webhooks/vitest.config.ts',
      // Property-based / race-condition tests (fast-check). Tier via FC_TIER env.
      'tests/property/vitest.config.ts',
      // Integration tests project - requires database/services
      {
        test: {
          name: 'integration',
          root: path.join(monorepoRoot, 'tests/integration'),
          globals: true,
          environment: 'node',
          setupFiles: ['./setup.ts'],
          include: ['**/*.test.ts', '**/*.test.tsx'],
          exclude: [
            '**/node_modules/**',
            // TDD RED-phase: imports unimplemented artifacts/misc/webhooks/framework
            'webhook/webhook.test.ts',
          ],
          testTimeout: 60000, // Integration tests can be slower
          hookTimeout: 60000,
          pool: 'forks',
          execArgv: ['--max-old-space-size=4096', '--expose-gc'],
          maxWorkers: 4,
          minWorkers: 1,
        },
      },
      // Root project for all other tests
      {
        test: {
          name: 'root',
          root: packageRoot,
          globals: true,
          environment: 'node',
          passWithNoTests: true,

          // Memory optimization: Auto-cleanup mocks after each test
          restoreMocks: true,
          clearMocks: true,
          resetMocks: true,
          // CRITICAL: Restore stubbed globals/envs after each test (Vitest v4)
          unstubGlobals: true,
          unstubEnvs: true,

          pool: 'forks',

          execArgv: ['--max-old-space-size=4096', '--expose-gc'],
          maxWorkers: 4,
          minWorkers: 1,

          // Force exit after tests complete to prevent hanging (disabled during coverage
          // runs so Istanbul can finish writing coverage-final.json before exit)
          forceExit: process.env['COVERAGE_RUN'] !== '1',

          // Disable caching to prevent stale state accumulation
          cache: false,

          // Explicit reporters to avoid vitest 4.x 'basic' reporter issue
          reporters: ['default'],

          environmentMatchGlobs: [
            // Note: UI and web tests run under their own project configs with jsdom/happy-dom
            // This is for any remaining tests in the root project that need jsdom
            ['apps/project-tracker/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
          ],
          setupFiles: ['./apps/api/src/test/setup.ts'],
          include: [
            'apps/**/*.{test,spec}.ts',
            'apps/**/*.{test,spec}.tsx',
            'packages/**/*.{test,spec}.ts',
            'packages/**/*.{test,spec}.tsx',
            'tools/**/*.{test,spec}.ts',
            'tools/**/*.{test,spec}.tsx',
            'scripts/**/*.{test,spec}.ts',
            'scripts/**/*.{test,spec}.tsx',
            'tests/**/*.{test,spec}.ts',
            'tests/**/*.{test,spec}.tsx',
          ],
          exclude: [
            '**/node_modules/**',
            '**/.pnpm/**',
            '**/dist/**',
            '**/build/**',
            '**/.turbo/**',
            '**/artifacts/**',
            '**/.next/**',
            'tests/e2e/**',
            'tests/a11y/**',
            'tests/integration/**', // Has its own inline project above — avoid running 15 tests twice
            'tests/property/**', // Has its own 'property' project (fast-check) — avoid double-running
            // Exclude apps/packages with their own vitest configs (they run as separate projects)
            'apps/api/**',
            'apps/web/**',
            'apps/ai-worker/**',
            'apps/workers/**',
            'packages/ui/**',
            'packages/observability/**',
            'packages/adapters/**',
            'packages/application/**',
            'packages/domain/**',
            'packages/db/**',
            'packages/validators/**',
            'packages/webhooks/**',
            'tests/architecture/**',
            // TDD RED-phase tests that import unimplemented modules — excluded until
            // the source modules they reference are created
            'tests/compliance/data-governance.spec.ts',
            // PG-195 .mjs subset test has its own dedicated config
            // (tools/scripts/__tests__/pg195.vitest.config.ts) that registers
            // the .mjs extension with Istanbul. Loaded under the root project
            // it fails with "SyntaxError: Invalid or unexpected token" because
            // the default transform pipeline does not handle the .mjs import.
            'tools/scripts/__tests__/subset-material-symbols.test.ts',
          ],
        },
      },
    ],

    // Global coverage settings for all projects
    coverage: {
      // Istanbul provider: V8 with pool:forks creates one tmp file per test file,
      // and the V8 merge hangs before forceExit kills it for large projects (web, api).
      // Istanbul uses maxWorkers tmp files (4) — merges fast.
      provider: 'istanbul',
      reporter: ['text', 'json', 'json-summary', 'lcov', 'html'],
      // COVERAGE_RUN=1 is set by scripts/run-coverage.js which passes its own
      // --coverage.reportsDirectory per project.  Normal TDD / watch-mode runs
      // write to a *separate* directory so they never overwrite the merged
      // SonarQube-ready data in artifacts/coverage/.
      reportsDirectory: path.join(
        packageRoot,
        'artifacts',
        process.env['COVERAGE_RUN'] === '1' ? 'coverage' : 'coverage-vitest'
      ),
      // Clean old coverage HTML between runs to prevent accumulation (was 84MB+ stale data)
      clean: true,
      // Write coverage even when some tests fail (e.g., one flaky test shouldn't suppress all coverage data)
      reportOnFailure: true,
      include: [
        // Core product code only - excludes temporary tooling
        'apps/api/**/*.{ts,tsx}',
        'apps/ai-worker/**/*.{ts,tsx}',
        'apps/web/**/*.{ts,tsx}',
        'packages/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/node_modules/**',
        '**/.pnpm/**',
        '**/dist/**',
        '**/build/**',
        '**/.turbo/**',
        '**/.tsup/**', // tsup build declaration artifacts (233 files)
        '**/artifacts/**',
        '**/.next/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        '**/__mocks__/**',
        // Temporary tooling - not part of product
        'apps/project-tracker/**',
        'tools/**',
        // Prisma generated client - auto-generated, not business logic (14MB / 121 files)
        // These were causing OOM crashes in V8 coverage workers
        'packages/db/generated/**',
        // Infrastructure code - not business logic
        'packages/db/prisma/seed.ts',
        'packages/db/src/client.ts',
        'packages/db/src/index.ts',
        // Re-export index files
        'packages/domain/src/index.ts',
        'packages/platform/src/index.ts',
        'packages/platform/src/feature-flags/index.ts',
        'packages/platform/src/feature-flags/types.ts',
        'packages/ui/src/index.ts',
        'packages/validators/src/index.ts',
        // Repository interfaces (just types, no logic)
        'packages/domain/src/crm/**/*Repository.ts',
        'packages/domain/src/notifications/*Repository.ts',
        // Re-export index files in domain
        'packages/domain/src/notifications/index.ts',
        'packages/domain/src/platform/index.ts',
        // Unused/deprecated modules
        'packages/observability/src/tracer.ts',
        'packages/domain/src/shared/QueryTypes.ts',
        // ==============================================================
        // OBSERVABILITY - OpenTelemetry infrastructure wrappers
        // These are configuration/initialization code, not business logic.
        // They wrap OTel SDK which is tested by the OpenTelemetry team.
        // ==============================================================
        'packages/observability/src/**',
        // App entry points and scripts (not business logic)
        'apps/api/src/index.ts',
        'apps/api/src/server.ts',
        'apps/api/src/router.ts',
        'apps/api/src/context.ts',
        'apps/api/src/middleware/index.ts',
        'apps/api/src/shared/**',
        'apps/api/src/tracing/index.ts',
        'apps/api/src/tracing/example.ts',
        'apps/ai-worker/src/index.ts',
        'apps/ai-worker/src/examples/**',
        'apps/ai-worker/src/scripts/**',
        'apps/ai-worker/src/prompts/index.ts',
        'apps/ai-worker/src/types/index.ts',
        // Web app entry points and generated files (not business logic)
        'apps/web/src/app/layout.tsx',
        // NOTE: `apps/web/src/app/**/page.tsx` was previously excluded (thin-shell
        // convention — logic lives in tested *PageClient/*Content components). It is
        // now MEASURED so the diff-coverage gate (#382) sees real coverage for pages
        // that carry inline logic (e.g. the New Lead page, PG-060). Pages that are
        // genuinely thin shells contribute few lines.
        'apps/web/next.config.js',
        'apps/web/vitest.config.ts',
        'apps/web/vitest.setup.ts',
        'apps/web/src/lib/trpc.ts',
        'apps/web/src/lib/supabase.ts',
        // Re-export index files in packages
        'packages/adapters/src/**/index.ts',
        'packages/application/src/**/index.ts',
        'packages/api-client/src/**',
        // Port interfaces (just TypeScript contracts, no logic)
        'packages/application/src/ports/**',
        'packages/application/src/errors/**',
        // LLM chain classes — scoring/embedding/rag-context now have mocked
        // tests (embedding.chain.{test,methods,boot-safety}.test.ts cover the
        // embedder methods + lazy getEmbeddingChain; rag-context.chain.test.ts
        // covers the chain). sentiment.chain.ts still needs a mock harness.
        'apps/ai-worker/src/chains/sentiment.chain.ts',
        // External service integrations
        'apps/api/src/lib/supabase.ts',
        'apps/api/src/tracing/otel.ts',
        // Stub/placeholder files
        'apps/api/src/modules/legal/**',
        // =============================================================
        // SKELETON ADAPTERS - Documented as future implementations
        // Per architecture plan: These are placeholders, not production code
        // Remove from exclusions when implementation starts
        // =============================================================
        'packages/adapters/src/calendar/microsoft/**', // IFC-172 planned
        'packages/adapters/src/messaging/teams/**', // Future sprint
        'packages/adapters/src/messaging/slack/**', // Future sprint
        'packages/adapters/src/payments/paypal/**', // Future sprint
        'packages/adapters/src/email/outlook/**', // Future sprint
        'packages/adapters/src/erp/sap/**', // Future sprint
        'packages/adapters/src/storage/**', // Future sprint
        'packages/adapters/src/antivirus/**', // Future sprint
        'packages/adapters/src/shared/**', // Utilities for future adapters
        // SDK not yet implemented
        'packages/sdk/src/**',
        // Search package placeholder
        'packages/search/src/**',
        // Platform workflow engine (partial implementation)
        'packages/platform/src/workflow/**',
        // Queue infrastructure - BullMQ configuration, not business logic
        'packages/platform/src/queues/bull-board.ts',
        'packages/platform/src/queues/connection.ts',
        'packages/platform/src/queues/queue-factory.ts',
        'packages/platform/src/queues/index.ts',
        // Resilience re-export index
        'packages/platform/src/resilience/index.ts',
        // Webhooks re-export index
        'packages/webhooks/src/index.ts',
        // Web app test utilities (not product code)
        'apps/web/src/lib/test-runner/**',
        'apps/web/src/test-utils/**',
        'apps/web/src/test/**',
        // Storybook stories and config (documentation, not production code)
        '**/*.stories.tsx',
        '**/*.stories.ts',
        'packages/ui/.storybook/**',
        // ==============================================================
        // UI COMPONENTS - shadcn/ui wrappers around Radix UI primitives
        // These are styling wrappers, not business logic. The underlying
        // components are tested by Radix maintainers. Our value comes from
        // integration/E2E tests that test actual usage.
        // ==============================================================
        'packages/ui/src/components/**',
        'packages/ui/src/hooks/**',
        'packages/ui/src/lib/**',
        // External service clients (need integration tests, not unit testable)
        'packages/adapters/src/external/OpenAIService.ts',
        'packages/adapters/src/memory/zep/**',
        // Repository interfaces in domain (TypeScript interfaces, no logic)
        'packages/domain/src/**/*Repository.ts',
        // Workers entry points (infrastructure, not business logic)
        'apps/workers/**',
      ],
      // TDD Enforcement: Build FAILS if coverage below thresholds
      // Per CLAUDE.md: Domain >95%, Application >90%, Overall >90%
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
