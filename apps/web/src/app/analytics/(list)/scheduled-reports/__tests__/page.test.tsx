/**
 * Scheduled Reports page.tsx Tests — PG-201
 * Server component + Suspense + metadata; reachability from the analytics sidebar.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/analytics/scheduled-reports/ScheduledReportsContent', () => ({
  default: () => <div data-testid="content-stub">content</div>,
}));

vi.mock('@/app/analytics/scheduled-reports/loading', () => ({
  default: () => <div data-testid="loading-stub">loading</div>,
}));

import Page, { metadata } from '../page';
import {
  REPORT_SETTINGS_ITEMS,
  isReportSettingsPage,
} from '@/components/sidebar/configs/analytics';

describe('Scheduled Reports page.tsx', () => {
  it('exports metadata', () => {
    expect(metadata.title).toBe('Scheduled Reports');
    expect(metadata.description).toMatch(/cron|recipients|delivery/i);
  });

  it('renders the content inside Suspense', () => {
    render(<Page />);
    expect(screen.getByTestId('content-stub')).toBeInTheDocument();
  });

  it('is a server component', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    expect(src).not.toMatch(/'use client'/);
  });

  it('is reachable from the analytics settings sidebar', () => {
    expect(REPORT_SETTINGS_ITEMS.map((i) => i.href)).toContain('/analytics/scheduled-reports');
    expect(isReportSettingsPage('/analytics/scheduled-reports')).toBe(true);
  });
});
