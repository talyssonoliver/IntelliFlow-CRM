/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
// Mock the 5 routing components
vi.mock('@/components/routing/RoutingRulesEditor', () => ({
  RoutingRulesEditor: () => <div data-testid="routing-rules-editor">RoutingRulesEditor</div>,
}));

vi.mock('@/components/routing/AssignmentDashboard', () => ({
  AssignmentDashboard: () => <div data-testid="assignment-dashboard">AssignmentDashboard</div>,
}));

vi.mock('@/components/routing/SLAMonitor', () => ({
  SLAMonitor: () => <div data-testid="sla-monitor">SLAMonitor</div>,
}));

vi.mock('@/components/routing/LeadQueueView', () => ({
  LeadQueueView: () => <div data-testid="lead-queue-view">LeadQueueView</div>,
}));

vi.mock('@/components/routing/AgentWorkload', () => ({
  AgentWorkload: () => <div data-testid="agent-workload">AgentWorkload</div>,
}));

vi.mock('@intelliflow/ui', () => ({
  Tabs: ({ children, defaultValue }: any) => (
    <div data-testid="tabs" data-default={defaultValue}>
      {children}
    </div>
  ),
  TabsList: ({ children, ...props }: any) => (
    <div role="tablist" {...props}>
      {children}
    </div>
  ),
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button role="tab" data-value={value} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value}>
      {children}
    </div>
  ),
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  Card: ({ children }: any) => <div>{children}</div>,
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header"><h1>{title}</h1>{description && <p>{description}</p>}</div>
  ),
}));

// Import RoutingContent directly (page.tsx uses dynamic import)
import RoutingContent from '../RoutingContent';

describe('Routing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    render(<RoutingContent />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lead Routing');
  });

  it('renders all 5 tab triggers', () => {
    render(<RoutingContent />);

    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Assignments')).toBeInTheDocument();
    expect(screen.getByText('SLA')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByText('Workload')).toBeInTheDocument();
  });

  it('renders RoutingRulesEditor in Rules tab', () => {
    render(<RoutingContent />);

    expect(screen.getByTestId('routing-rules-editor')).toBeInTheDocument();
  });

  it('renders AssignmentDashboard in Assignments tab', () => {
    render(<RoutingContent />);

    expect(screen.getByTestId('assignment-dashboard')).toBeInTheDocument();
  });

  it('renders SLAMonitor in SLA tab', () => {
    render(<RoutingContent />);

    expect(screen.getByTestId('sla-monitor')).toBeInTheDocument();
  });

  it('renders LeadQueueView in Queue tab', () => {
    render(<RoutingContent />);

    expect(screen.getByTestId('lead-queue-view')).toBeInTheDocument();
  });

  it('renders AgentWorkload in Workload tab', () => {
    render(<RoutingContent />);

    expect(screen.getByTestId('agent-workload')).toBeInTheDocument();
  });

  it('has tabs with aria-label', () => {
    render(<RoutingContent />);

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-label', 'Routing settings tabs');
  });

  it('default tab is Rules', () => {
    render(<RoutingContent />);

    const tabs = screen.getByTestId('tabs');
    expect(tabs).toHaveAttribute('data-default', 'rules');
  });
});
