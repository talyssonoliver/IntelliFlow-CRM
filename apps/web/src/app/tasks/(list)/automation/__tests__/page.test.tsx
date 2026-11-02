/**
 * Task Automation Page Tests — PG-208 (AC-TA-001)
 * Suspense wrapper + metadata export + server-component discipline; the old
 * "coming soon" placeholder is gone.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../TaskAutomationContent', () => ({
  default: () => <div data-testid="content-stub">content</div>,
}));

vi.mock('../TaskAutomationLoading', () => ({
  default: () => <div data-testid="loading-stub">loading</div>,
}));

import Page, { metadata } from '../page';

describe('Task Automation page.tsx', () => {
  it('exports metadata with title and description', () => {
    expect(metadata.title).toMatch(/Task Automation/);
    expect(metadata.description).toMatch(/rules/i);
  });

  it('renders TaskAutomationContent inside Suspense', () => {
    render(<Page />);
    expect(screen.getByTestId('content-stub')).toBeInTheDocument();
  });

  it('is a server component without placeholder copy', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    expect(src).not.toMatch(/'use client'/);
    expect(src).not.toMatch(/coming soon/i);
    expect(src).toMatch(/<Suspense fallback=\{<TaskAutomationLoading \/>\}>/);
  });
});
