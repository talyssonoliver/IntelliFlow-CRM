import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OG_IMAGES } from '../og-images';

/** The image every public page shares speaks for the brand on every social share. */
describe('OG_IMAGES', () => {
  const generator = fs.readFileSync(path.join(__dirname, '../../app/opengraph-image.tsx'), 'utf8');
  const generatorAlt = /export const alt = '([^']+)'/.exec(generator)?.[1];

  it('describes the image with the same alt text the generator declares', () => {
    expect(generatorAlt).toBeTruthy();
    expect(OG_IMAGES[0]?.alt).toBe(generatorAlt);
  });

  it('carries the Aurora name and no old brand or em dash, in the alt or the image', () => {
    expect(OG_IMAGES[0]?.alt).toContain('Aurora');
    expect(OG_IMAGES[0]?.alt).not.toMatch(/IntelliFlow|—/);
    // What the image renders: the source without its comments.
    const rendered = generator
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'))
      .join(' ');
    expect(rendered).not.toMatch(/IntelliFlow|—/);
  });
});
