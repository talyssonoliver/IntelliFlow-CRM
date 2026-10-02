import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The three fixed sidebars must read the header's published height, never assume 4rem.
 * With the ADR-071 pinned banner the header is taller, and a `top-16` sidebar sits under it.
 * A source assertion rather than a layout one: happy-dom computes no layout.
 */
const SIDEBARS = [
  'sidebar/AppSidebar.tsx',
  'shared/module-settings-nav.tsx',
  'shared/complementary-sidebar.tsx',
];

describe('fixed sidebars follow the header height', () => {
  it.each(SIDEBARS)('%s offsets from --app-header-h and never from a fixed 4rem', (rel) => {
    const src = readFileSync(join(__dirname, '..', '..', rel), 'utf8');
    expect(src).toContain('top-[var(--app-header-h,4rem)]');
    expect(src).not.toMatch(/['"\s]top-16['"\s]/);
  });
});
