import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // DTS disabled - api-client doesn't export declarations
  sourcemap: true,
  clean: true,
  external: [
    'react',
    '@tanstack/react-query',
    '@trpc/client',
    '@trpc/react-query',
    '@intelliflow/api-client',
    '@intelliflow/domain',
  ],
});
