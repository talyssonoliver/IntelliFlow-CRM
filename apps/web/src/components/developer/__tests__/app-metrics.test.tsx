import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppMetrics } from '../app-metrics';
import { createMockDeveloperApp, createMockApiKey } from '@/test/fixtures/developer-data';
import { DEMO_APPS } from '@/lib/developer/demo-data';

describe('AppMetrics', () => {
  const activeApp = DEMO_APPS.find((a) => a.id === 'app-001')!;
  const pendingApp = DEMO_APPS.find((a) => a.id === 'app-002')!;
  const inactiveApp = DEMO_APPS.find((a) => a.id === 'app-003')!;

  // M-001: Renders metrics section content
  it('renders metrics section for active app', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('Total API Calls')).toBeInTheDocument();
  });

  // M-002: Shows total API calls stat card
  it('shows total API calls stat card with value', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('14,820')).toBeInTheDocument();
  });

  // M-003: Shows average response time stat card
  it('shows average response time stat card', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('Avg Response Time')).toBeInTheDocument();
    expect(screen.getByText('187ms')).toBeInTheDocument();
  });

  // M-004: Shows error rate stat card
  it('shows error rate stat card', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
    expect(screen.getByText('1.2%')).toBeInTheDocument();
  });

  // M-005: Shows active keys count stat card
  it('shows active keys count stat card', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('Active Keys')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // M-006: Daily API calls chart container has aria-label
  it('daily API calls chart has aria-label', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByRole('img', { name: /daily api calls/i })).toBeInTheDocument();
  });

  // M-007: Error breakdown bar present for active apps
  it('error breakdown bar present for active app', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('Error Breakdown')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /error breakdown/i })).toBeInTheDocument();
  });

  // M-008: Empty/pending state for app with no activity
  it('shows empty state for pending app with no activity', () => {
    render(<AppMetrics app={pendingApp} />);
    expect(screen.getByText('No usage data available.')).toBeInTheDocument();
  });

  // M-009: App with zero API keys shows empty state
  it('shows empty state for app with zero API keys and no usage', () => {
    const noKeysApp = createMockDeveloperApp({
      id: 'app-002',
      apiKeys: [],
    });
    render(<AppMetrics app={noKeysApp} />);
    expect(screen.getByText('No usage data available.')).toBeInTheDocument();
  });

  // M-010: Active app (app-001) shows non-zero metrics
  it('active app shows non-zero call count', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('14,820')).toBeInTheDocument();
  });

  // M-011: Inactive app (app-003) shows trailing metrics
  it('inactive app shows trailing metrics', () => {
    render(<AppMetrics app={inactiveApp} />);
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('341ms')).toBeInTheDocument();
  });

  // M-012: Chart containers have role="img" or descriptive aria-label
  it('chart containers have role="img" with aria-label', () => {
    render(<AppMetrics app={activeApp} />);
    const imgElements = screen.getAllByRole('img');
    expect(imgElements.length).toBeGreaterThanOrEqual(1);
    imgElements.forEach((el) => {
      expect(el).toHaveAttribute('aria-label');
    });
  });

  // M-013: Per-key usage breakdown table present for apps with keys
  it('per-key usage table present for app with keys', () => {
    render(<AppMetrics app={activeApp} />);
    expect(screen.getByText('Per-Key Usage')).toBeInTheDocument();
    expect(screen.getByText('Dashboard API Key')).toBeInTheDocument();
    expect(screen.getByText('Analytics Key')).toBeInTheDocument();
  });

  // M-014: Component renders without crashing with minimal props
  it('renders without crashing with a minimal mock app', () => {
    const minimalApp = createMockDeveloperApp({
      id: 'app-999',
      apiKeys: [createMockApiKey()],
    });
    const { container } = render(<AppMetrics app={minimalApp} />);
    expect(container.firstChild).toBeTruthy();
  });
});
