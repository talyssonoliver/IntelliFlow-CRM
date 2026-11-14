// @vitest-environment node
/**
 * The root layout's title template appends "| Aurora", so a page that writes its own
 * brand suffix must use `title: { absolute }` or the tab reads "Email | Aurora | Aurora".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = resolve(__dirname, '..');
const SUFFIXED_TITLE = /^\s*(?:return \{ )?title:(?! *\{)[^\n]*[|—] *Aurora/;
const NESTED_METADATA = /^\s*(?:openGraph|twitter)\s*:\s*\{\s*$/;

function metadataFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : metadataFiles(path);
    return /^(page|layout)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

function doubledTitles(source: string): number[] {
  const found: number[] = [];
  let nestedAt: number | null = null;
  source.split('\n').forEach((line, index) => {
    const indent = line.length - line.trimStart().length;
    if (nestedAt !== null && indent <= nestedAt) nestedAt = null;
    if (nestedAt === null && NESTED_METADATA.test(line)) nestedAt = indent;
    else if (nestedAt === null && SUFFIXED_TITLE.test(line)) found.push(index + 1);
  });
  return found;
}

describe('page titles', () => {
  it('flags a suffixed title and leaves absolute and social titles alone', () => {
    expect(doubledTitles("  title: 'Email | Aurora',")).toEqual([1]);
    expect(doubledTitles("  title: app ? 'Mine | Aurora' : 'None',")).toEqual([1]);
    expect(doubledTitles("  title: { absolute: 'Email | Aurora' },")).toEqual([]);
    expect(doubledTitles("  openGraph: {\n    title: 'Email | Aurora',\n  },")).toEqual([]);
  });

  it('never repeats the brand the root template adds', () => {
    const offenders = metadataFiles(APP_DIR).flatMap((file) =>
      doubledTitles(readFileSync(file, 'utf8')).map((line) => `${relative(APP_DIR, file)}:${line}`)
    );
    expect(offenders).toEqual([]);
  });
});
