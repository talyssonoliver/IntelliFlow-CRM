import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import securityPlugin from 'eslint-plugin-security';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import prettierConfig from 'eslint-config-prettier';
import { noEagerRequiredProdEnvSelectors } from './eslint-rules/no-eager-required-prod-env.mjs';

// Inject tsconfigRootDir into typescript-eslint parser config.
// The monorepo has multiple tsconfig.json files (root + apps/project-tracker)
// and the parser cannot auto-detect which to use without this.
const tsRecommended = tseslint.configs.recommended.map((config) => {
  if (config.languageOptions?.parser) {
    return {
      ...config,
      languageOptions: {
        ...config.languageOptions,
        parserOptions: {
          ...config.languageOptions.parserOptions,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    };
  }
  return config;
});

export default [
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/artifacts/**',
      '**/.scannerwork/**',
      '**/sonar-reports/**',
      // Claude Code tooling — hooks, skills, worktrees; not production code
      '.claude/**',
    ],
  },

  // Base config for all files
  js.configs.recommended,
  ...tsRecommended,
  prettierConfig,

  // General TypeScript/JavaScript files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        // Node globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        // ES2022
        Promise: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        WeakSet: 'readonly',
        WeakMap: 'readonly',
        Symbol: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      import: importPlugin,
      security: securityPlugin,
      sonarjs: sonarjsPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      // Monorepo baseline: keep lint running without type-aware configuration.
      // Tighten progressively once existing code is brought into compliance.
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off', // Prefer TS compiler for now
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      // ==========================================
      // ReDoS / SAST gate (2026-06-11, issue #382, extends #349)
      // Mirrors SonarCloud rule S5852 ("slow-regex") locally so a polynomial-
      // backtracking regex (e.g. /\/+$/) fails `pnpm run lint` BEFORE push —
      // the exact gap that let PG-060 pass pre-ship and red CI on a Security
      // Hotspot. Uses sonarjs/slow-regex (eslint-plugin-sonarjs >=3) which
      // flags quadratic/exponential quantifier patterns without requiring type
      // info, unlike the weaker security/detect-unsafe-regex (safe-regex-based,
      // doesn't catch polynomial cases).
      'sonarjs/slow-regex': 'error',
    },
  },

  // ==========================================
  // IFC-131: Architecture Boundary Enforcement
  // Hexagonal Architecture Import Restrictions
  // ==========================================

  // IFC-310 AC-003: The duplicate-rule-evaluator must stay pure.
  // No Prisma, no @intelliflow/db, no node:fs / node:net, no domain/application
  // cross-imports. This override complements the test-level module-boundary
  // assertion in apps/api/src/shared/__tests__/duplicate-rule-evaluator.test.ts
  // (static + runtime enforcement, as specified by the plan).
  {
    files: ['apps/api/src/shared/duplicate-rule-evaluator.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '@prisma/*'],
              message:
                'AC-003: duplicate-rule-evaluator must remain pure — no Prisma imports allowed.',
            },
            {
              group: ['@intelliflow/db', '@intelliflow/db/*'],
              message:
                'AC-003: duplicate-rule-evaluator must remain pure — no database package imports allowed.',
            },
            {
              group: ['node:fs', 'node:fs/*', 'fs', 'fs/*'],
              message: 'AC-003: duplicate-rule-evaluator must remain pure — no filesystem access.',
            },
            {
              group: ['node:net', 'net', 'node:http', 'http', 'node:https', 'https'],
              message: 'AC-003: duplicate-rule-evaluator must remain pure — no network I/O.',
            },
            {
              group: ['@intelliflow/application', '@intelliflow/application/*'],
              message:
                'AC-003: duplicate-rule-evaluator is a shared pure helper; must not depend on application layer.',
            },
          ],
        },
      ],
    },
  },

  // Domain Layer: MUST NOT depend on application, adapters, or infrastructure
  {
    files: ['packages/domain/src/**/*.ts', 'packages/domain/src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@intelliflow/application', '@intelliflow/application/*'],
              message:
                'Domain layer cannot depend on application layer. Domain is the innermost layer in hexagonal architecture.',
            },
            {
              group: ['@intelliflow/adapters', '@intelliflow/adapters/*'],
              message:
                'Domain layer cannot depend on adapters layer. Domain must remain pure business logic.',
            },
            {
              group: ['@intelliflow/db', '@intelliflow/db/*'],
              message:
                'Domain layer cannot depend on database package. Use repository interfaces instead.',
            },
            {
              group: ['@prisma/client', '@prisma/*'],
              message:
                'Domain layer cannot depend on Prisma. Database concerns belong in adapters layer.',
            },
            {
              group: ['express', 'express/*', 'fastify', 'fastify/*', 'koa', 'koa/*'],
              message:
                'Domain layer cannot depend on HTTP frameworks. These belong in adapters layer.',
            },
            {
              group: ['@trpc/server', '@trpc/*'],
              message:
                'Domain layer cannot depend on tRPC. API concerns belong in adapters/apps layer.',
            },
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'Domain layer cannot depend on React. UI concerns belong in apps layer.',
            },
            {
              group: ['next', 'next/*'],
              message:
                'Domain layer cannot depend on Next.js. Framework concerns belong in apps layer.',
            },
            {
              group: ['pg', 'mysql', 'mysql2', 'redis', 'ioredis', 'mongodb'],
              message:
                'Domain layer cannot depend on database drivers. These belong in adapters layer.',
            },
            {
              group: ['@aws-sdk/*', '@azure/*', '@google-cloud/*'],
              message: 'Domain layer cannot depend on cloud SDKs. Wrap these in adapters layer.',
            },
          ],
        },
      ],
    },
  },

  // Application Layer: CAN depend on domain, MUST NOT depend on adapters or infrastructure
  {
    files: ['packages/application/src/**/*.ts', 'packages/application/src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@intelliflow/adapters', '@intelliflow/adapters/*'],
              message:
                'Application layer cannot depend on adapters layer. Use ports (interfaces) instead.',
            },
            {
              group: ['@intelliflow/db', '@intelliflow/db/*'],
              message:
                'Application layer cannot depend on database package. Define repository ports instead.',
            },
            {
              group: ['@prisma/client', '@prisma/*'],
              message:
                'Application layer cannot depend on Prisma. Database implementation belongs in adapters.',
            },
            {
              group: ['express', 'express/*', 'fastify', 'fastify/*', 'koa', 'koa/*'],
              message:
                'Application layer cannot depend on HTTP frameworks. These belong in adapters layer.',
            },
            {
              group: ['@trpc/server'],
              message:
                'Application layer cannot depend on tRPC server. API implementation belongs in apps layer.',
            },
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message:
                'Application layer cannot depend on React. UI concerns belong in apps layer.',
            },
            {
              group: ['pg', 'mysql', 'mysql2', 'redis', 'ioredis', 'mongodb'],
              message:
                'Application layer cannot depend on database drivers. These belong in adapters layer.',
            },
            {
              group: ['@aws-sdk/*', '@azure/*', '@google-cloud/*'],
              message:
                'Application layer cannot depend on cloud SDKs. Wrap these in adapters layer.',
            },
          ],
        },
      ],
    },
  },

  // ==========================================
  // Timezone Safety Rules
  // Prevent server-local time usage in production code.
  // All date display must use explicit timeZone option;
  // all date boundaries must use UTC constructors.
  // ==========================================
  {
    files: [
      'apps/api/src/**/*.ts',
      'apps/web/src/**/*.ts',
      'apps/web/src/**/*.tsx',
      'apps/ai-worker/src/**/*.ts',
      'packages/application/src/**/*.ts',
      'packages/adapters/src/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString'][arguments.length=0]",
          message:
            'Bare toLocaleDateString() uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatDate().',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString'][arguments.length=0]",
          message:
            'Bare toLocaleTimeString() uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatTime().',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString'][arguments.length=0]",
          message:
            'Bare toLocaleString() on Date uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatDateTime().',
        },
        {
          selector: "CallExpression[callee.property.name='getHours']",
          message:
            'getHours() uses server-local timezone. Use getUTCHours() for UTC or getHourInTimezone() from timezone-utils for user timezone.',
        },
        {
          selector: "CallExpression[callee.property.name='getDate']",
          message:
            'getDate() uses server-local timezone. Use getUTCDate() for UTC or timezone-utils for user-aware boundaries.',
        },
      ],
    },
  },

  // ==========================================
  // D4 / defect-D4: no-eager-requiredProdEnv
  // requiredProdEnv() must NEVER be called at module-init scope (top-level
  // VariableDeclaration, exported const initializer, or class PropertyDefinition
  // initializer). A single missing env var at that scope crashes the entire
  // process at import/boot time before any request is handled. Always call
  // requiredProdEnv() inside a function/factory so the throw is deferred until
  // the code path that actually needs the value is executed.
  // ==========================================
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts', 'packages/**/*.tsx'],
    ignores: [
      // Definitions are intentionally excluded — they declare, not call.
      'packages/validators/src/required-url.ts',
      'packages/observability/src/required-url.ts',
      'apps/web/src/lib/required-url.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...noEagerRequiredProdEnvSelectors],
    },
  },

  // Test files - keep flexible
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        vi: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      // Keep tests flexible.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow importing from any layer in tests for mocking
      'no-restricted-imports': 'off',
      // Timezone-safety rules fire in test files where local-time Date methods
      // are common and intentional (e.g. constructing test fixtures relative to
      // the runner's local clock, asserting boundaries). Production code is still
      // covered by the timezone rules in the general config above.
      'no-restricted-syntax': 'off',
    },
  },

  // Config files, CJS scripts, and plain JS/MJS utilities
  {
    files: [
      '**/next.config.js',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
      '**/*.cjs',
      'scripts/**/*.js',
      'tools/**/*.js',
      'lighthouserc.js',
    ],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
