/**
 * postbuild-esm.mjs — runs AFTER tsup (including DTS) completes.
 *
 * Creates package.json with "type":"module" in generated/prisma/ so that
 * tsx and Node ESM treat .ts and .js files there as ESM modules.
 * Without this, `export *` in the .js shims fails because tsx treats .ts
 * as CJS when no "type":"module" is set, and ESM→CJS `export *` drops
 * named exports.
 *
 * This MUST run after DTS build — tsc TS1479 errors if it sees CJS source
 * importing from an ESM package during declaration emit.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = join(__dirname, '..', 'generated', 'prisma');

if (existsSync(generatedDir)) {
  writeFileSync(
    join(generatedDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2) + '\n',
  );
  console.log('[postbuild-esm] Created generated/prisma/package.json (type: module)');
}
