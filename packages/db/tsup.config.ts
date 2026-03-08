import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/seed-ids.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  // Externalize the generated Prisma client — it lives at packages/db/generated/prisma/
  // and must NOT be bundled into dist/. Both src/ and dist/ resolve ../generated/prisma/client
  // to the same location since they are siblings at the package root.
  noExternal: [],
  external: [/generated\/prisma/],
  async onSuccess() {
    const rootDir = import.meta.dirname ?? '.';
    const distDir = join(rootDir, 'dist');
    const generatedDir = join(rootDir, 'generated', 'prisma');

    // 1. Post-process ESM dist files: append .js extension to extensionless
    //    generated/prisma imports. Node ESM requires file extensions for
    //    relative imports, but tsup/esbuild emits them without.
    let patched = 0;
    for (const file of readdirSync(distDir)) {
      if (!file.endsWith('.mjs')) continue;
      const filePath = join(distDir, file);
      const content = readFileSync(filePath, 'utf8');
      const fixed = content.replaceAll(
        /from "(\.\.\/generated\/prisma\/[^"]+?)(?<!\.js)"/g,
        'from "$1.js"',
      );
      if (fixed !== content) {
        writeFileSync(filePath, fixed);
        patched++;
      }
    }
    if (patched > 0) {
      console.log(`[prisma-esm] Patched ${patched} .mjs files with .js extensions`);
    }

  },
});
