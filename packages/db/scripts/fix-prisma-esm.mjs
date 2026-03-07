/**
 * fix-prisma-esm.mjs
 *
 * Prisma 7 generates .ts files but uses .js extension imports
 * (TypeScript ESM convention: `import from "./enums.js"` resolves to `enums.ts`).
 *
 * This works with TypeScript's module resolution and webpack's `extensionAlias`,
 * but Turbopack (Next.js dev bundler) cannot resolve .js → .ts.
 *
 * Fix: create .js shim files next to every .ts file in the generated directory.
 * Each shim re-exports from the corresponding .ts file, allowing Turbopack
 * to resolve the .js import and follow the chain to the .ts source.
 *
 * Run after `prisma generate`.
 */

import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(__dirname, '..', 'generated', 'prisma');

let created = 0;

function walkDir(dir) {
  if (!existsSync(dir)) {
    console.log(`[fix-prisma-esm] Directory not found: ${dir} — skipping`);
    return;
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath);
      continue;
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;

    const jsPath = fullPath.replace(/\.ts$/, '.js');
    const tsFile = basename(entry);

    // Create .js shim that re-exports from the .ts file.
    // With "type":"module" in generated/prisma/package.json (created by tsup
    // onSuccess), these .js files are treated as ESM, so `export *` correctly
    // forwards all named exports including namespace re-exports.
    const isClientFile = tsFile === 'client.ts';
    const shimContent = isClientFile
      ? `// Auto-generated shim (see fix-prisma-esm.mjs)\nexport * from './${tsFile}';\nexport { Prisma } from './${tsFile}';\n`
      : `// Auto-generated shim (see fix-prisma-esm.mjs)\nexport * from './${tsFile}';\n`;
    writeFileSync(jsPath, shimContent);
    created++;
  }
}

walkDir(GENERATED_DIR);
console.log(`[fix-prisma-esm] Created ${created} .js shim files in generated/prisma/`);

