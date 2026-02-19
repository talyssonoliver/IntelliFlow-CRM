/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockLeads = [
  {
    id: 'lead-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    score: 85,
    source: 'WEBSITE',
    status: 'NEW',
    estimatedValue: 5000,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'lead-2',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    score: 60,
    source: 'REFERRAL',
    status: 'CONTACTED',
    estimatedValue: null,
    createdAt: new Date().toISOString(),
  },
];

const mockAssignLead = { mutate: vi.fn(), isPending: false };

vi.mock('@/app/settings/routing/hooks/useRouting', () => ({
  useLeadQueue: () => ({
    data: mockLeads,
    isLoading: false,
  }),
  useRouting: () => ({
    assignLead: mockAssignLead,
    agentWorkload: [
      { userId: 'u1', user: { name: 'Agent A' } },
    ],
  }),
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onCheckedChange(!checked)}
      {...props}
    />
  ),
  Input: (props: any) => <input {...props} />,
  Select: ({ children, onValueChange: _onValueChange }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectValue: () => <span />,
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

import { LeadQueueView } from '../LeadQueueView';

describe('LeadQueueView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unassigned leads table with correct columns', () => {
    render(<LeadQueueView />);

    expect(screen.getByText('Lead Queue')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('shows lead scores', () => {
    render(<LeadQueueView />);

    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('shows lead sources', () => {
    render(<LeadQueueView />);

    expect(screen.getByText('WEBSITE')).toBeInTheDocument();
    expect(screen.getByText('REFERRAL')).toBeInTheDocument();
  });

  it('shows estimated value formatted', () => {
    render(<LeadQueueView />);

    expect(screen.getByText('$5,000')).toBeInTheDocument();
  });

  it('shows dash for missing estimated value', () => {
    render(<LeadQueueView />);

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('has select all checkbox', () => {
    render(<LeadQueueView />);

    const selectAll = screen.getByLabelText('Select all leads');
    expect(selectAll).toBeInTheDocument();
  });

  it('has individual checkboxes', () => {
    render(<LeadQueueView />);

    expect(screen.getByLabelText('Select John Doe')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Jane Smith')).toBeInTheDocument();
  });
});
