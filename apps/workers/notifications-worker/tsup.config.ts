import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs', 'esm'],
  dts: {
    compilerOptions: {
      composite: false,
      declaration: true,
      declarationMap: true,
    },
  },
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
