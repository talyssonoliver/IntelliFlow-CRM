import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // uuid v10+ is ESM-only; bundling it inline lets esbuild handle the
  // ESM→CJS conversion so TypeScript's Node16 module checker never sees
  // a cross-format require() and TS1479 is avoided.
  noExternal: ['uuid'],
});
