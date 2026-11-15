/**
 * Guards vitest.node-env-files.txt, the list of web test files that run in the node
 * environment ('web-node' project) instead of happy-dom. A file on the list gets no DOM,
 * so it must not need one.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { literalGlob, nodeEnvGlobs, readNodeEnvFiles } from '../../../vitest.node-env';

const webRoot = path.resolve(__dirname, '../../..');

/** Imports that bring in a DOM or render into one. */
const DOM_IMPORT =
  /from\s+['"](@testing-library\/(react|dom|user-event)|react-dom(\/[\w-]+)?|happy-dom|jsdom)['"]/;
/** Reading the DOM globals (`document.x`, `window.x`), not a word or a `globalThis.document` stub. */
const DOM_GLOBAL = /(?<![\w.$])(document|window)\s*\./;

function domReasons(source: string): string[] {
  const reasons: string[] = [];
  if (DOM_IMPORT.test(source)) reasons.push('imports a DOM library');
  if (DOM_GLOBAL.test(source)) reasons.push('reads document/window');
  return reasons;
}

describe('vitest.node-env-files.txt', () => {
  const files = readNodeEnvFiles();

  it('lists files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('has no duplicate entries', () => {
    expect(files.length).toBe(new Set(files).size);
  });

  it('lists only .ts test files that exist', () => {
    const bad = files.filter(
      (f) => !/\.(test|spec)\.ts$/.test(f) || !existsSync(path.join(webRoot, f))
    );
    expect(bad).toEqual([]);
  });

  it('lists only files without DOM imports or document/window access', () => {
    const bad = files
      .map((f) => ({ f, why: domReasons(readFileSync(path.join(webRoot, f), 'utf8')) }))
      .filter((x) => x.why.length > 0);
    expect(bad).toEqual([]);
  });
});

describe('node-env list helpers', () => {
  it('skips blank lines and comments, and accepts CRLF', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'node-env-list-'));
    try {
      const list = path.join(dir, 'list.txt');
      writeFileSync(list, '# header\r\n\r\nsrc/a.test.ts\r\n  src/b.test.ts  \n');
      expect(readNodeEnvFiles(list)).toEqual(['src/a.test.ts', 'src/b.test.ts']);
      expect(nodeEnvGlobs(list)).toEqual(['src/a.test.ts', 'src/b.test.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('escapes route-group and dynamic-segment folders so they match literally', () => {
    expect(literalGlob('src/app/(public)/lp/[slug]/x.test.ts')).toBe(
      'src/app/\\(public\\)/lp/\\[slug\\]/x.test.ts'
    );
  });

  it('flags DOM imports and DOM global reads, not the words', () => {
    expect(domReasons("import { render } from '@testing-library/react';")).toEqual([
      'imports a DOM library',
    ]);
    expect(domReasons("import { createRoot } from 'react-dom/client';")).toEqual([
      'imports a DOM library',
    ]);
    expect(domReasons('const t = document.title;')).toEqual(['reads document/window']);
    expect(domReasons('window.open(url);')).toEqual(['reads document/window']);
    expect(domReasons("getEventTypeIcon('document'); // window should be active")).toEqual([]);
    expect(domReasons('(globalThis as any).document = { body: {} };')).toEqual([]);
  });
});
