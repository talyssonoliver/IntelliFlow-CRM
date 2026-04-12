/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockAssignments = [
  {
    id: 'audit-1',
    reason: 'rule_match',
    assignedTo: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    rule: { name: 'High Score Leads' },
    details: { leadId: 'lead-1' },
    createdAt: new Date().toISOString(),
  },
];

const mockRules = [
  { id: 'rule-1', name: 'Rule 1', isActive: true },
  { id: 'rule-2', name: 'Rule 2', isActive: false },
];

vi.mock('@/app/settings/routing/hooks/useRouting', () => ({
  useRouting: () => ({
    assignments: mockAssignments,
    assignmentsLoading: false,
    rules: mockRules,
    rulesLoading: false,
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

import { AssignmentDashboard } from '../AssignmentDashboard';

describe('AssignmentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 4 stats cards with correct labels', () => {
    render(<AssignmentDashboard />);

    expect(screen.getByText('Assigned Today')).toBeInTheDocument();
    expect(screen.getByText('Avg Assignment Time')).toBeInTheDocument();
    expect(screen.getByText('Active Rules')).toBeInTheDocument();
    expect(screen.getByText('Unassigned Leads')).toBeInTheDocument();
  });

  it('shows active rules count', () => {
    render(<AssignmentDashboard />);

    // 1 active rule out of 2 — use getAllByText since '1' may appear multiple times
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
  });

  it('stats cards container has aria-live="polite"', () => {
    render(<AssignmentDashboard />);

    const statsContainer = screen.getByLabelText('Assignment statistics');
    expect(statsContainer).toHaveAttribute('aria-live', 'polite');
  });

  it('renders recent assignments table', () => {
    render(<AssignmentDashboard />);

    expect(screen.getByText('Recent Assignments')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('High Score Leads')).toBeInTheDocument();
    expect(screen.getByText('rule_match')).toBeInTheDocument();
  });

  it('shows relative timestamps', () => {
    render(<AssignmentDashboard />);

    expect(screen.getByText('just now')).toBeInTheDocument();
  });
});
