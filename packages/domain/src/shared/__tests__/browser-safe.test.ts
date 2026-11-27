/**
 * The domain package is shared with the browser: the web app imports its barrel (the enum lists, the
 * ID classes). A Node built-in imported anywhere in it makes the web bundler ship a polyfill for that
 * module: `node:crypto` alone brought in `crypto-browserify` (about 400 KB with stream, util and vm
 * shims, the last of which calls `eval` on every page load and trips a strict Content-Security-Policy).
 * So no non-test file of the domain package may import a Node built-in.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');
const NODE_IMPORT =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:node:[a-z_/]+|(?:assert|buffer|child_process|crypto|events|fs|http|https|net|os|path|stream|string_decoder|tls|url|util|vm|zlib)(?:\/[a-z]+)?)['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('domain package stays browser-safe', () => {
  const files = sourceFiles(SRC);

  it('finds the package source to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('imports no Node built-in module', () => {
    const offenders = files
      .filter((file) => NODE_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });
});
