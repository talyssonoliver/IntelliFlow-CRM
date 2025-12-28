/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
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
  },
  overrides: [
    // ==========================================
    // IFC-131: Architecture Boundary Enforcement
    // Hexagonal Architecture Import Restrictions
    // ==========================================

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
                message:
                  'Domain layer cannot depend on React. UI concerns belong in apps layer.',
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
                message:
                  'Domain layer cannot depend on cloud SDKs. Wrap these in adapters layer.',
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

    // Test files - keep flexible
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      env: {
        jest: true,
      },
      rules: {
        // Keep tests flexible.
        '@typescript-eslint/no-explicit-any': 'off',
        // Allow importing from any layer in tests for mocking
        'no-restricted-imports': 'off',
      },
    },

    // Config files
    {
      files: ['**/next.config.js', '**/tailwind.config.js', '**/*.config.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.next/',
    'coverage/',
    '.turbo/',
    'artifacts/',
    '.scannerwork/',
    'sonar-reports/',
  ],
};
