import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * No-Duplicate Prompt Sanitizer Guard (QUAL-015)
 *
 * IFC-125's prompt/PII sanitizer used to exist as two independently
 * maintained copies:
 *   - apps/api/src/shared/prompt-sanitizer.ts
 *   - packages/adapters/src/shared/prompt-sanitizer.ts
 *
 * They diverged silently (their command-injection regex excluded different
 * whitespace characters, and only one copy had the sanitizeOutput()/PII
 * redaction path) until QUAL-015 consolidated both into a single canonical
 * module at packages/domain/src/security/prompt-sanitizer.ts, re-exported via
 * @intelliflow/domain.
 *
 * This test fails the build if that duplication is reintroduced: either as a
 * literal copy of the two deleted files, or as any other source file that
 * reimplements the sanitizer's distinctive internals outside the canonical
 * module.
 */

const projectRoot = path.resolve(__dirname, '../../');
const CANONICAL_RELATIVE_PATH = path.join(
  'packages',
  'domain',
  'src',
  'security',
  'prompt-sanitizer.ts'
);
const CANONICAL_ABSOLUTE_PATH = path.join(projectRoot, CANONICAL_RELATIVE_PATH);

const DELETED_DUPLICATE_PATHS = [
  path.join(projectRoot, 'apps', 'api', 'src', 'shared', 'prompt-sanitizer.ts'),
  path.join(projectRoot, 'packages', 'adapters', 'src', 'shared', 'prompt-sanitizer.ts'),
];

// Signatures unique to the sanitizer's internals. A reimplementation
// (accidental copy-paste, or a "helpful" local re-derivation) would still
// carry at least one of these unless it were rewritten beyond recognition,
// which is out of scope for a duplication guard.
const SIGNATURES = [
  'DANGEROUS_PATTERNS = [',
  'PII_PATTERNS = {',
  'export function sanitizePrompt(',
  'export function sanitizeOutput(',
];

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.turbo', 'coverage', '.next', '.git']);

function getTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) {
    return files;
  }

  function traverse(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) {
          continue;
        }
        traverse(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

describe('No duplicate prompt sanitizer (QUAL-015)', () => {
  test('the canonical domain module exists', () => {
    expect(fs.existsSync(CANONICAL_ABSOLUTE_PATH)).toBe(true);
  });

  test('the two consolidated duplicate files were not resurrected', () => {
    for (const deletedPath of DELETED_DUPLICATE_PATHS) {
      expect(fs.existsSync(deletedPath)).toBe(false);
    }
  });

  test.each(SIGNATURES)(
    'signature %j appears in exactly one source file (the canonical module)',
    (signature) => {
      const allFiles = [
        ...getTypeScriptFiles(path.join(projectRoot, 'apps')),
        ...getTypeScriptFiles(path.join(projectRoot, 'packages')),
      ];

      const matches = allFiles.filter((file) => {
        // Skip test files - assertions/mocks legitimately reference these
        // strings (e.g. describe block names, mock factories) without being a
        // second implementation.
        if (/\.(test|spec)\.tsx?$/.test(file) || /__tests__/.test(file)) {
          return false;
        }
        const content = fs.readFileSync(file, 'utf-8');
        return content.includes(signature);
      });

      const relativeMatches = matches.map((f) => path.relative(projectRoot, f));

      if (relativeMatches.length !== 1 || relativeMatches[0] !== CANONICAL_RELATIVE_PATH) {
        console.error(
          `\nExpected signature ${JSON.stringify(signature)} to appear in exactly one file ` +
            `(${CANONICAL_RELATIVE_PATH}), found:\n` +
            relativeMatches.map((f) => `  - ${f}`).join('\n')
        );
      }

      expect(relativeMatches).toEqual([CANONICAL_RELATIVE_PATH]);
    }
  );
});
