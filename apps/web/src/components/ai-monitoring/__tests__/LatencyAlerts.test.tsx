import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/latency',
  useSearchParams: () => new URLSearchParams(),
}));

import { LatencyAlerts } from '../LatencyAlerts';
import type { LatencyAlert } from '@/lib/ai-monitoring/types';

const now = Date.now();

const mockAlerts: LatencyAlert[] = [
  {
    severity: 'critical',
    message: 'P95 latency exceeded SLO target',
    timestamp: new Date(now - 5 * 60000).toISOString(),
    model: 'gpt-4',
    operationType: 'summarize',
    currentP95: 600,
    targetP95: 500,
  },
  {
    severity: 'warning',
    message: 'P95 latency approaching target',
    timestamp: new Date(now - 10 * 60000).toISOString(),
    model: 'claude-3',
    operationType: 'classify',
    currentP95: 450,
    targetP95: 500,
  },
];

describe('LatencyAlerts', () => {
  it('renders empty state when no alerts', () => {
    render(<LatencyAlerts alerts={[]} />);
    expect(screen.getByTestId('no-latency-alerts')).toBeInTheDocument();
    expect(screen.getByText('No latency alerts')).toBeInTheDocument();
  });

  it('renders warning alert card with amber styling', () => {
    render(<LatencyAlerts alerts={[mockAlerts[1]]} />);
    const alertCard = screen.getByTestId('latency-alert');
    expect(alertCard.className).toContain('amber');
  });

  it('renders critical alert card with red styling', () => {
    render(<LatencyAlerts alerts={[mockAlerts[0]]} />);
    const alertCard = screen.getByTestId('latency-alert');
    expect(alertCard.className).toContain('red');
  });

  it('shows alert message text', () => {
    render(<LatencyAlerts alerts={mockAlerts} />);
    expect(screen.getByText('P95 latency exceeded SLO target')).toBeInTheDocument();
    expect(screen.getByText('P95 latency approaching target')).toBeInTheDocument();
  });

  it('shows model and operationType labels', () => {
    render(<LatencyAlerts alerts={mockAlerts} />);
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('summarize')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
    expect(screen.getByText('classify')).toBeInTheDocument();
  });

  it('shows currentP95 vs targetP95 values', () => {
    render(<LatencyAlerts alerts={mockAlerts} />);
    const details = screen.getAllByTestId('alert-p95-detail');
    expect(details[0]).toHaveTextContent('600ms');
    expect(details[0]).toHaveTextContent('500ms');
  });

  it('badge count matches alert array length', () => {
    render(<LatencyAlerts alerts={mockAlerts} />);
    const badge = screen.getByTestId('alert-count');
    expect(badge).toHaveTextContent('2');
  });

  it('handles single alert correctly', () => {
    render(<LatencyAlerts alerts={[mockAlerts[0]]} />);
    const alerts = screen.getAllByTestId('latency-alert');
    expect(alerts).toHaveLength(1);
    expect(screen.getByTestId('alert-count')).toHaveTextContent('1');
  });
});
