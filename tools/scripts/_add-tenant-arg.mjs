/**
 * Adds a tenantId argument (default constant name "TENANT") to calls of the
 * given repository methods. Used in the fix-failing-tests loop for repo tests
 * whose signatures added tenantId but the callers didn't.
 *
 * Usage: node tools/scripts/_add-tenant-arg.mjs <file> <arg-name> <method>...
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , file, argName, ...methods] = process.argv;
if (!file || !argName || !methods.length) {
  console.error('usage: <file> <arg-name> <method>...');
  process.exit(1);
}

let src = readFileSync(file, 'utf8');

for (const method of methods) {
  // Balanced-paren match: allow up to one level of nested parens inside args.
  const re = new RegExp(
    `repository\\.${method}\\(((?:[^()]|\\([^()]*\\))*)\\)`,
    'g'
  );
  src = src.replace(re, (_, args) => {
    // Preserve empty-arg calls? Still add the tenant arg.
    const trimmed = args.trim();
    const sep = trimmed.length === 0 ? '' : ', ';
    return `repository.${method}(${args}${sep}${argName})`;
  });
}

writeFileSync(file, src);
console.log(`rewrote ${file}`);
