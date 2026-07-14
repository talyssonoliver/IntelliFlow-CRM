/**
 * Task Settings Page Tests — PG-191
 * Validates Suspense wrapper + metadata export + server-component discipline.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../TaskSettingsContent', () => ({
  default: () => <div data-testid="content-stub">content</div>,
}));

vi.mock('../TaskSettingsLoading', () => ({
  default: () => <div data-testid="loading-stub">loading</div>,
}));

import Page, { metadata } from '../page';

describe('Task Settings page.tsx', () => {
  it('exports metadata with title and description', () => {
    expect(metadata).toBeDefined();
    expect(metadata.title).toMatch(/Task Settings/i);
    expect(metadata.description).toMatch(/due-date|reminder|template/i);
  });

  it('renders TaskSettingsContent inside Suspense', () => {
    render(<Page />);
    expect(screen.getByTestId('content-stub')).toBeInTheDocument();
  });

  it('page.tsx is a server component (no "use client")', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    expect(src).not.toMatch(/'use client'/);
  });
});
