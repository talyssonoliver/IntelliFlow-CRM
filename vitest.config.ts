import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Root Vitest configuration for IntelliFlow CRM monorepo.
 *
 * Turbo often runs Vitest from inside individual workspace packages, so this
 * config is deliberately "portable" and uses the current working directory as
 * the test root.
 */
const packageRoot = process.cwd();

export default defineConfig({
  test: {
    root: packageRoot,
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    // Use jsdom for UI component tests
    environmentMatchGlobs: [
      ['packages/ui/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
    ],
    // Setup files for UI tests (jest-dom matchers)
    setupFiles: ['./packages/ui/__tests__/setup.ts'],

    include: [
      'apps/**/*.{test,spec}.ts',
      'apps/**/*.{test,spec}.tsx',
      'packages/**/*.{test,spec}.ts',
      'packages/**/*.{test,spec}.tsx',
      'tools/**/*.{test,spec}.ts',
      'tools/**/*.{test,spec}.tsx',
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
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov', 'html'],
      reportsDirectory: path.join(packageRoot, 'artifacts', 'coverage'),
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
        // Unused/deprecated modules
        'packages/observability/src/tracer.ts',
        'packages/domain/src/shared/QueryTypes.ts',
        // Uses runtime require() - can't be unit tested
        'packages/observability/src/index.ts',
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
        'apps/web/**',
        // Re-export index files in packages
        'packages/adapters/src/**/index.ts',
        'packages/application/src/**/index.ts',
        'packages/api-client/src/**',
        // Port interfaces (just TypeScript contracts, no logic)
        'packages/application/src/ports/**',
        'packages/application/src/errors/**',
        // LLM integration chains (require external services)
        'apps/ai-worker/src/chains/**',
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
