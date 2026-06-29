/**
 * Report Templates page.tsx Tests — PG-200
 * Validates Suspense wrapper + metadata export.
 * Page lives under analytics/(list)/report-templates/ to inherit ModuleGate.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/analytics/report-templates/ReportTemplatesContent', () => ({
  default: () => <div data-testid="content-stub">content</div>,
}));

vi.mock('@/app/analytics/report-templates/loading', () => ({
  default: () => <div data-testid="loading-stub">loading</div>,
}));

import Page, { metadata } from '../page';

describe('Report Templates page.tsx', () => {
  it('exports metadata with title and description', () => {
    expect(metadata).toBeDefined();
    expect(metadata.title).toMatch(/Report Templates/i);
    expect(metadata.description).toMatch(/template|layout|report/i);
  });

  it('renders ReportTemplatesContent inside Suspense', () => {
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
