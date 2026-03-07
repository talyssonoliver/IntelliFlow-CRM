/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockAgents = [
  {
    id: 'avail-1',
    userId: 'u1',
    status: 'ONLINE',
    currentCapacity: 3,
    maxCapacity: 10,
    shiftStart: '2024-01-01T09:00:00Z',
    shiftEnd: '2024-01-01T17:00:00Z',
    user: { id: 'u1', name: 'Alice Agent', email: 'alice@example.com' },
    skills: [
      { id: 's1', skillName: 'Sales', proficiency: 4 },
      { id: 's2', skillName: 'Support', proficiency: 3 },
    ],
  },
  {
    id: 'avail-2',
    userId: 'u2',
    status: 'BUSY',
    currentCapacity: 8,
    maxCapacity: 10,
    shiftStart: '2024-01-01T10:00:00Z',
    shiftEnd: '2024-01-01T18:00:00Z',
    user: { id: 'u2', name: 'Bob Agent', email: 'bob@example.com' },
    skills: [],
  },
];

vi.mock('@/app/settings/routing/hooks/useRouting', () => ({
  useRouting: () => ({
    agentWorkload: mockAgents,
    agentWorkloadLoading: false,
  }),
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  Progress: ({ value, ...props }: any) => (
    <div
      role="progressbar"
      data-testid="progress"
      aria-valuenow={value ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    />
  ),
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@intelliflow/domain', () => ({
  AGENT_STATUSES: ['ONLINE', 'BUSY', 'AWAY', 'OFFLINE', 'ON_BREAK'],
}));

import { AgentWorkload } from '../AgentWorkload';

describe('AgentWorkload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders agent cards with names', () => {
    render(<AgentWorkload />);

    expect(screen.getByText('Alice Agent')).toBeInTheDocument();
    expect(screen.getByText('Bob Agent')).toBeInTheDocument();
  });

  it('renders status badges', () => {
    render(<AgentWorkload />);

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Busy')).toBeInTheDocument();
  });

  it('renders capacity gauges with role="progressbar"', () => {
    render(<AgentWorkload />);

    const gaugeElements = screen.getAllByRole('progressbar');
    expect(gaugeElements.length).toBe(2);
  });

  it('capacity gauge has aria-valuenow', () => {
    render(<AgentWorkload />);

    const gaugeElements = screen.getAllByRole('progressbar');
    expect(gaugeElements[0]).toHaveAttribute('aria-valuenow', '30'); // 3/10 = 30%
    expect(gaugeElements[1]).toHaveAttribute('aria-valuenow', '80'); // 8/10 = 80%
  });

  it('capacity gauge has aria-valuemin and aria-valuemax', () => {
    render(<AgentWorkload />);

    const gaugeElements = screen.getAllByRole('progressbar');
    expect(gaugeElements[0]).toHaveAttribute('aria-valuemin', '0');
    expect(gaugeElements[0]).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders skill badges with proficiency', () => {
    render(<AgentWorkload />);

    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('(4/5)')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('(3/5)')).toBeInTheDocument();
  });

  it('renders avatar initials', () => {
    render(<AgentWorkload />);

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('shows capacity numbers', () => {
    render(<AgentWorkload />);

    expect(screen.getByText('3/10')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });
});
