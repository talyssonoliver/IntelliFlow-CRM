/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Circular dependencies are usually a code smell. Fix when possible.',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-orphans',
      severity: 'info',
      comment: 'Files with no dependencies that are not depended on either.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', // dot files
          '\\.d\\.ts$', // TypeScript declaration files
          '(^|/)tsconfig\\.json$',
          '(^|/)vitest\\.config\\.ts$',
          '(^|/)jest\\.config\\.(js|ts|mjs|cjs)$',
          '(^|/)test/.*',
          '(^|/)tests/.*',
          '(^|/)__tests__/.*',
        ],
      },
      to: {},
    },
    {
      name: 'no-domain-to-adapters',
      severity: 'error',
      comment: 'Domain layer must not depend on infrastructure/adapters (hexagonal architecture)',
      from: {
        path: '^packages/domain',
      },
      to: {
        path: '^packages/adapters',
      },
    },
    {
      name: 'no-domain-to-external-infra',
      severity: 'error',
      comment: 'Domain layer must not depend on external infrastructure packages',
      from: {
        path: '^packages/domain',
      },
      to: {
        path: [
          'node_modules/@prisma',
          'node_modules/prisma',
          'node_modules/@supabase',
          'node_modules/redis',
          'node_modules/ioredis',
        ],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)',
      },
    },
  },
};
