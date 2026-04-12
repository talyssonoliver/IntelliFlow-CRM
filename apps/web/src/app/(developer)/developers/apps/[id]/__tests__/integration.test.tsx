import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDashboard } from '@/components/developer/app-dashboard';

// Integration tests use real child components (AppMetrics loaded as-is)

describe('DeveloperAppDetail Integration', () => {
  // I-001: Full render for app-001 shows app name
  it('full render for app-001 shows app name with real components', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('IntelliFlow Dashboard');
  });

  // I-002: All 3 demo apps accessible via different ids
  it('all 3 demo apps render correctly', () => {
    const { unmount } = render(<AppDashboard appId="app-001" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('IntelliFlow Dashboard');
    unmount();

    const { unmount: u2 } = render(<AppDashboard appId="app-002" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CRM Sandbox App');
    u2();

    render(<AppDashboard appId="app-003" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Legacy Connector');
  });

  // I-003: API key never shown in full in rendered output
  it('no full API key appears in rendered DOM', () => {
    const { container } = render(<AppDashboard appId="app-001" />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/ifc_live_[0-9a-f]{40}/);
  });

  // I-004: All buttons have accessible names
  it('all buttons have accessible names', () => {
    render(<AppDashboard appId="app-001" />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      const name = button.getAttribute('aria-label') || button.textContent;
      expect(name).toBeTruthy();
    });
  });

  // I-005: Tab navigation renders correct panel content for each tab
  it('tab navigation renders correct panel content', async () => {
    const user = userEvent.setup();
    render(<AppDashboard appId="app-001" />);

    // Overview tab default
    expect(screen.getByText('App Information')).toBeVisible();

    // Switch to Metrics
    await user.click(screen.getByRole('tab', { name: 'Metrics' }));
    expect(screen.getByText('Total API Calls')).toBeVisible();

    // Switch to Logs
    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(screen.getByText('Request Logs')).toBeVisible();

    // Switch back to Overview
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.getByText('App Information')).toBeVisible();
  });

  // I-006: Icons have aria-hidden="true"
  it('all material icons have aria-hidden="true"', () => {
    const { container } = render(<AppDashboard appId="app-001" />);
    const icons = container.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  // I-007: Heading hierarchy: single h1, h2s for sections
  it('heading hierarchy has single h1 and section h2s', () => {
    render(<AppDashboard appId="app-001" />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(1);
  });

  // I-008: Scopes badges rendered for app
  it('scope badges are rendered for app', () => {
    render(<AppDashboard appId="app-001" />);
    expect(screen.getAllByText('read').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('write').length).toBeGreaterThanOrEqual(1);
  });
});
