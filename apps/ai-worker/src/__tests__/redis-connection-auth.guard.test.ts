/**
 * Guard for #789: every Redis connection built from REDIS_HOST must also carry
 * REDIS_PASSWORD. Three BullMQ queues once passed host + port only, and
 * production Redis answered "NOAUTH Authentication required" (54 times in the
 * first six minutes after a restart) while the job itself reported success.
 * Use getBullMQConnectionOptions() from @intelliflow/platform/queues instead
 * of building connection objects by hand.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(__dirname, '..', '..', '..', '..');
const ROOTS = ['apps/ai-worker/src', 'apps/workers'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
  });
}

/** The `{ ... }` object literal that encloses position `at`, by brace matching. */
function enclosingObject(source: string, at: number): string {
  let depth = 0;
  let start = at;
  for (; start > 0; start--) {
    if (source[start] === '}') depth++;
    if (source[start] === '{') {
      if (depth === 0) break;
      depth--;
    }
  }
  depth = 0;
  let end = start;
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}

export function findUnauthenticatedConnections(files: string[]): string[] {
  const offenders = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (
      let at = source.indexOf('REDIS_HOST');
      at !== -1;
      at = source.indexOf('REDIS_HOST', at + 1)
    ) {
      const lineStart = source.lastIndexOf('\n', at) + 1;
      if (!source.slice(lineStart, at).includes('host:')) continue;
      const literal = enclosingObject(source, at);
      if (!literal.includes('password')) {
        const line = source.slice(0, at).split('\n').length;
        offenders.add(`${relative(REPO, file).split(sep).join('/')}:${line}`);
      }
    }
  }
  return [...offenders];
}

describe('Redis connections carry the password', () => {
  it('no worker builds a REDIS_HOST connection without REDIS_PASSWORD', () => {
    const files = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)));
    expect(files.length).toBeGreaterThan(10);
    expect(findUnauthenticatedConnections(files)).toEqual([]);
  });
});
