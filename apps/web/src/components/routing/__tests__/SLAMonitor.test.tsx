/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/settings/routing/hooks/useRouting', () => ({
  useRouting: () => ({
    assignmentsLoading: false,
  }),
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

import { SLAMonitor } from '../SLAMonitor';

describe('SLAMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SLA policy section with response time targets', () => {
    render(<SLAMonitor />);

    expect(screen.getByText('SLA Policies')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('shows all SLAs on track message (empty state)', () => {
    render(<SLAMonitor />);

    expect(screen.getByText('All SLAs are on track')).toBeInTheDocument();
  });

  it('renders breach section header', () => {
    render(<SLAMonitor />);

    expect(screen.getByText('Active Breaches')).toBeInTheDocument();
  });

  it('displays response and follow-up targets', () => {
    render(<SLAMonitor />);

    // Some values appear in both response and follow-up columns
    expect(screen.getAllByText('1 hour').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('4 hours').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('24 hours').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('72 hours')).toBeInTheDocument();
  });
});
