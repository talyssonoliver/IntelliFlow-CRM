/**
 * Report Settings Page Tests — PG-187
 * Validates Suspense wrapper + metadata export.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../ReportSettingsContent', () => ({
  default: () => <div data-testid="content-stub">content</div>,
}));

vi.mock('../loading', () => ({
  default: () => <div data-testid="loading-stub">loading</div>,
}));

import Page, { metadata } from '../page';

describe('Report Settings page.tsx', () => {
  it('exports metadata with title and description', () => {
    expect(metadata).toBeDefined();
    expect(metadata.title).toMatch(/Report Settings/i);
    expect(metadata.description).toMatch(/date range|currency|delivery/i);
  });

  it('renders ReportSettingsContent inside Suspense', () => {
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
