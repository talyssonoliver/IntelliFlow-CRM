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
    {
      name: 'no-web-imports-worker-only-modules',
      severity: 'error',
      comment:
        'apps/web must never import worker-only modules (BullMQ queues / queue services, ' +
        'AI provider services that require REDIS_HOST/OLLAMA_BASE_URL/LITELLM_BASE_URL). ' +
        'These modules require env vars the web tier does not have, causing 500s on every ' +
        'route when the container is constructed at module load time. ' +
        'If the web needs AI functionality, add a dedicated web-safe lightweight service. ' +
        'See fix/web-worker-service-decoupling for the root cause analysis.',
      from: {
        path: '^apps/web',
        pathNot: [
          // Allow test files to import anything (mocked anyway)
          '\\.(test|spec)\\.(ts|tsx)$',
          '__tests__',
          '__mocks__',
        ],
      },
      to: {
        path: [
          // Queue AI service — requires REDIS_HOST at construction time
          '^apps/api/src/services/queue',
          // Platform queue connection helper — calls requiredProdEnv('REDIS_HOST')
          '^packages/platform/src/queues/connection',
          // Ollama AI service — requires OLLAMA_BASE_URL
          '^packages/adapters/src/.*[Oo]llama',
          // LiteLLM AI service — requires LITELLM_BASE_URL
          '^packages/adapters/src/.*[Ll]ite[Ll]lm',
          // BullMQ itself — never bundle in the web tier
          'node_modules/bullmq',
        ],
      },
    },
    {
      name: 'no-web-imports-api-container',
      severity: 'error',
      comment:
        'apps/web must never import apps/api/src/container directly. ' +
        'The DI container constructs worker-only services (QueueAIService, ' +
        'OllamaAIService, LiteLLMAIService, Redis clients) at module-load time, ' +
        'causing Vercel boot failures when the required env vars are absent. ' +
        'Allowed: importing @intelliflow/api for TypeScript type inference only. ' +
        'Approved runtime pattern: HTTP tRPC client call from web to the Railway ' +
        'API service — see ADR-063. ' +
        'The existing /api/trpc route.ts + trpc-server.ts coupling is a known ' +
        'architectural debt tracked in ADR-063; this rule blocks NEW direct ' +
        'container imports from being introduced. ' +
        'Root cause documented in incident-forensics-2026-06-04.md defects D1/D6.',
      from: {
        path: '^apps/web',
        pathNot: ['\\.(test|spec)\\.(ts|tsx)$', '__tests__', '__mocks__'],
      },
      to: {
        path: [
          // The DI container itself — never import this from apps/web
          '^apps/api/src/container',
          // API-internal worker services wired directly in the container
          '^apps/api/src/services/AIMonitoringService',
          '^apps/api/src/modules/ai-monitoring/ai-monitoring\\.redis-store',
          '^apps/api/src/modules/home/home\\.cache',
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
