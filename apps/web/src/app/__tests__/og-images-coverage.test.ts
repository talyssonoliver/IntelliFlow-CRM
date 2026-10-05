import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * IFC-208 / F-006. A page or layout that declares its own `openGraph` replaces
 * the root's wholesale, so the file-based og:image from app/opengraph-image.tsx
 * does not reach it. Every public `openGraph` block must name the shared image
 * itself (OG_IMAGES), or that page shares with no preview image.
 */
const PUBLIC_DIR = join(__dirname, '..', '(public)');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });
}

describe('public Open Graph images (IFC-208)', () => {
  const withOpenGraph = sourceFiles(PUBLIC_DIR).filter((f) =>
    readFileSync(f, 'utf8').includes('openGraph:')
  );

  it('finds the public pages that declare openGraph', () => {
    expect(withOpenGraph.length).toBeGreaterThan(20);
  });

  it.each(withOpenGraph.map((f) => [relative(PUBLIC_DIR, f), f]))(
    '%s gives its openGraph block the shared og:image',
    (_name, file) => {
      const src = readFileSync(file, 'utf8');
      const blocks = src.split('openGraph:').length - 1;
      const withImages = (src.match(/openGraph: \{\s*images: OG_IMAGES,/g) ?? []).length;
      expect(withImages).toBe(blocks);
    }
  );
});
