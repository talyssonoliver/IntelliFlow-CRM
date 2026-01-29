/**
 * File I/O Utilities
 */

import { spawnSync } from 'node:child_process';
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
 * Write JSON file with consistent formatting
 */
export function writeJsonFile(path: string, data: unknown, space = 2): void {
  writeFileSync(path, `${JSON.stringify(data, null, space)}\n`, 'utf-8');
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
export function resolvePrettierBin(repoRoot: string): string | null {
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
