/**
 * Test helper: load `src/logging.ts` through Node's CommonJS loader (IFC-074).
 *
 * Production loads this package as CommonJS (`node dist/main.js`, tsup CJS
 * output), and the OTel pino instrumentation patches pino through the CJS
 * require hook. Vitest's own module graph differs between the package config
 * and the root workspace config (used by coverage and CI shards), so a spy on
 * `import('pino')` is not guaranteed to reach the pino that logging.ts uses.
 * Bundling logging.ts to CJS in memory (esbuild, reached through tsup's
 * dependency tree) and requiring `pino` from the same directory gives the
 * tests the exact module instance production uses, under every runner.
 */

import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type LoggingModule = typeof import('../logging');

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(srcDir, 'logging.ts');

/** `require` resolving from src/ — the same resolution the bundled logging.ts uses. */
export const requireFromSrc = createRequire(entry);

/** Bundle src/logging.ts to CommonJS and load it with Node's CJS loader. */
export function loadLoggingAsCommonJs(): LoggingModule {
  const esbuild = createRequire(requireFromSrc.resolve('tsup'))(
    'esbuild'
  ) as typeof import('esbuild');
  const out = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    external: ['pino', 'pino-pretty', '@opentelemetry/*'],
  });
  const mod = new Module(entry) as Module & {
    _compile(code: string, filename: string): void;
    paths: string[];
  };
  mod.filename = entry;
  mod.paths = (Module as unknown as { _nodeModulePaths(dir: string): string[] })._nodeModulePaths(
    srcDir
  );
  mod._compile(out.outputFiles[0].text, entry);
  return mod.exports as LoggingModule;
}
