/**
 * Document Settings Page Tests - PG-186
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock next/dynamic to capture the loading component
vi.mock('next/dynamic', () => ({
  default: (_fn: () => Promise<unknown>, opts: { loading?: () => React.ReactNode }) => {
    return opts?.loading ? opts.loading : () => null;
  },
}));

describe('DocumentSettingsPage', () => {
  it('page module exports a default component', async () => {
    const mod = (await import('../page.js' as string)) as { default: unknown };
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('page.tsx file contains the "use client" directive', () => {
    const src = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf-8');
    expect(src.startsWith("'use client'") || src.startsWith('"use client"')).toBe(true);
  });
});
