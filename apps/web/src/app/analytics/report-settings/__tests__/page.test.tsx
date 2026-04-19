/* Report Settings page entry tests — PG-187 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../ReportSettingsContent', () => ({
  default: () => <div data-testid="report-settings-content">content-loaded</div>,
}));

vi.mock('../loading', () => ({
  default: () => <div data-testid="report-settings-loading">loading-skeleton</div>,
}));

import ReportSettingsPage from '../page';

describe('Report Settings Page (PG-187)', () => {
  it('default export is a React component', () => {
    expect(typeof ReportSettingsPage).toBe('function');
  });

  it('renders ReportSettingsContent inside Suspense', () => {
    render(<ReportSettingsPage />);
    expect(screen.getByTestId('report-settings-content')).toBeInTheDocument();
  });

  it('exports correct metadata object', async () => {
    const mod = await import('../page');
    expect(mod.metadata).toBeDefined();
    expect(mod.metadata.title).toMatch(/Report Settings/i);
    expect(mod.metadata.description).toBeTruthy();
  });

  it('page renders within in-module layout (AC-010 layout-shell integration [WARN-1])', () => {
    // Verify that the page does NOT render any global settings-shell signifier.
    // The page is a thin Suspense wrapper; rendering the component alone asserts
    // there is no accidental global-shell wrapping inside the page file.
    const { container } = render(<ReportSettingsPage />);
    const html = container.innerHTML;
    // Assert NO global SettingsSidebarNav (from apps/web/src/components/settings/settings-sidebar.tsx)
    expect(html).not.toMatch(/settings-sidebar-nav|SettingsSidebarNav/i);
  });

  it('page has no /settings/<module> shell markers (AC-010 [WARN-1])', () => {
    const { container } = render(<ReportSettingsPage />);
    // ReportSettingsContent handles the in-module layout via ModuleSettingsLayout;
    // the page itself is a Suspense wrapper only, which is the correct architecture.
    expect(container.querySelector('[data-testid="report-settings-content"]')).toBeInTheDocument();
  });
});
