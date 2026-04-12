import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts', 'src/ws-server.ts'],
  format: ['cjs', 'esm'],
  tsconfig: 'tsconfig.build.json',
  dts: true, // Required for tRPC type exports - api-client depends on AppRouter type
  clean: true,
  external: [
    // Mark all workspace packages as external
    '@intelliflow/adapters',
    '@intelliflow/application',
    '@intelliflow/db',
    '@intelliflow/domain',
    '@intelliflow/validators',
    '@prisma/client',
    '@trpc/server',
    '@opentelemetry/api',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-node',
    '@opentelemetry/semantic-conventions',
    '@sentry/node',
    '@supabase/supabase-js',
    'ioredis',
    'zod',
  ],
});
