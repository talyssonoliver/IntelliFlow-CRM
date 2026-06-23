/**
 * File I/O Utilities
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const nodeRequire = createRequire(import.meta.url);

/**
 * Read a JSON file that may be wrapped in Markdown code fences
 */
export function readJsonTolerant(path: string): any {
  let content = readFileSync(path, 'utf-8');
  content = content.replace(/^```\s*json\s*/i, '');
  content = content.replace(/^```\s*/i, '');
  content = content.replace(/```\s*$/i, '');
  content = content.trim();
  return JSON.parse(content);
}

/**
 * Write JSON file with consistent formatting.
 *
 * Skip-if-unchanged: if the serialized bytes are byte-identical to the file
 * already on disk, return without writing. A sync over hundreds of task JSONs
 * used to rewrite every file (new mtime + a git diff) even when nothing changed;
 * this collapses the write cascade to only the files that actually changed.
 * See ADR-066.
 */
export function writeJsonFile(path: string, data: unknown, space = 2): void {
  const next = `${JSON.stringify(data, null, space)}\n`;
  // Read-and-compare without a preceding existsSync() check: a missing/unreadable
  // file just throws and falls through to the write. Avoiding the check-then-write
  // shape keeps this free of a file-system TOCTOU race (CodeQL js/file-system-race).
  try {
    const current = readFileSync(path, 'utf-8');
    // Fast path: byte-identical to what we'd write.
    if (current === next) return;
    // Format-insensitive path (ADR-067): the on-disk file may have been reformatted
    // by prettier (e.g. the pre-commit hook inlines short arrays) while this writer
    // always emits JSON.stringify multiline. A byte compare then ALWAYS misses and
    // rewrites every file on every sync — the cascade ADR-066's skip-if-unchanged
    // was meant to kill, defeated in practice by the formatter mismatch. Compare the
    // PARSED content instead: if the value is unchanged, skip the write regardless of
    // whitespace/array formatting. Only a real content change triggers a write.
    if (JSON.stringify(JSON.parse(current)) === JSON.stringify(data)) return;
  } catch {
    // missing / unreadable / non-JSON existing file — (re)write it below
  }
  writeFileSync(path, next, 'utf-8');
}

/**
 * Write JSON, treating the given top-level `volatileKeys` (freshness stamps such
 * as `last_updated`) as non-significant. If every OTHER field is byte-identical
 * to what is already on disk, the prior volatile values are carried forward so
 * the file is left untouched — a no-op sync stops churning roll-up files purely
 * because of a refreshed timestamp. Falls back to writeJsonFile (which is itself
 * skip-if-unchanged) for the actual write. See ADR-066.
 */
export function writeJsonFileStable(
  path: string,
  data: Record<string, unknown>,
  volatileKeys: string[],
  space = 2
): void {
  if (volatileKeys.length > 0) {
    // readJsonTolerant throws for a missing/unreadable file (caught below) — no
    // existsSync() pre-check, so there is no check-then-use race window.
    try {
      const prev = readJsonTolerant(path) as Record<string, unknown>;
      const withoutVolatile = (o: Record<string, unknown>): string => {
        const clone: Record<string, unknown> = { ...o };
        for (const key of volatileKeys) delete clone[key];
        return JSON.stringify(clone);
      };
      if (withoutVolatile(prev) === withoutVolatile(data)) {
        for (const key of volatileKeys) {
          if (Object.prototype.hasOwnProperty.call(prev, key)) data[key] = prev[key];
          else delete data[key];
        }
      }
    } catch {
      // missing/unreadable/non-JSON existing file — fall through to a normal write
    }
  }
  writeJsonFile(path, data, space);
}

/**
 * Find repository root by looking for pnpm-workspace.yaml or .git
 */
export function findRepoRoot(startDir: string): string | null {
  let dir = startDir;

  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, '.git'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve prettier binary path
 */
function _resolvePrettierBin(repoRoot: string): string | null {
  const isWindows = process.platform === 'win32';
  const nodeModulesPaths = isWindows
    ? [
        join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
        join(repoRoot, 'node_modules', 'prettier', 'bin-prettier.cjs'),
        join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.js'),
      ]
    : [
        join(repoRoot, 'node_modules', '.bin', 'prettier'),
        join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
        join(repoRoot, 'node_modules', 'prettier', 'bin-prettier.cjs'),
      ];

  for (const candidate of nodeModulesPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const requireCandidates = [
    'prettier/bin/prettier.cjs',
    'prettier/bin-prettier.cjs',
    'prettier/bin/prettier.js',
  ];

  for (const candidate of requireCandidates) {
    try {
      const resolved = nodeRequire.resolve(candidate);
      if (!resolved.includes('[') && existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // try next
    }
  }

  return null;
}

/**
 * Try to format metrics JSON files with prettier
 * DISABLED: Causes extreme slowdowns in dev
 */
export function tryFormatMetricsJson(_metricsDir: string): void {
  // DISABLED: Prettier formatting causes extreme slowdowns in dev (157+ minutes)
  return;
}

/**
 * Find all task JSON files in a directory
 */
export function findAllTaskJsons(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findAllTaskJsons(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Find a task file by ID in a directory
 */
export function findTaskFile(taskId: string, baseDir: string): string | null {
  const search = (dir: string): string | null => {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const found = search(fullPath);
        if (found) return found;
      } else if (entry.name === `${taskId}.json`) {
        return fullPath;
      }
    }

    return null;
  };

  return search(baseDir);
}
