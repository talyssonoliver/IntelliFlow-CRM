/**
 * @vitest-environment jsdom
 * RiskFactorsCard Component Tests (PG-131)
 * AC-004: Severity badges, descriptions, empty/loading states.
 */
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { RiskFactorsCard } from '../forecast/RiskFactorsCard';
import { createMockRiskFactor } from './deal-test-utils';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, ...props }: { children: React.ReactNode; className?: string }) => (
    <div {...props}>{children}</div>
  ),
  Skeleton: ({ className, ...props }: { className?: string }) => (
    <div data-testid="skeleton" className={className} {...props} />
  ),
}));

describe('RiskFactorsCard', () => {
  it('renders list of risk factors', () => {
    const factors = [
      createMockRiskFactor({ id: 'r1', factor: 'Low engagement' }),
      createMockRiskFactor({ id: 'r2', factor: 'Stale pipeline' }),
    ];
    render(<RiskFactorsCard factors={factors} />);

    expect(screen.getByText('Low engagement')).toBeInTheDocument();
    expect(screen.getByText('Stale pipeline')).toBeInTheDocument();
  });

  it('shows severity badges (high=red, medium=amber, low=green)', () => {
    const factors = [
      createMockRiskFactor({ id: 'r1', severity: 'high' }),
      createMockRiskFactor({ id: 'r2', severity: 'medium' }),
      createMockRiskFactor({ id: 'r3', severity: 'low' }),
    ];
    render(<RiskFactorsCard factors={factors} />);

    const badges = screen.getAllByTestId('severity-badge');
    expect(badges).toHaveLength(3);
    // high badge should have red class
    expect(badges[0].className).toContain('bg-red-100');
    // medium badge should have amber class
    expect(badges[1].className).toContain('bg-amber-100');
    // low badge should have green class
    expect(badges[2].className).toContain('bg-green-100');
  });

  it('shows factor description text', () => {
    const factors = [createMockRiskFactor({ description: 'Current 40% vs 60% default' })];
    render(<RiskFactorsCard factors={factors} />);

    expect(screen.getByText('Current 40% vs 60% default')).toBeInTheDocument();
  });

  it('shows impact text', () => {
    const factors = [createMockRiskFactor({ impact: '20 points below expected' })];
    render(<RiskFactorsCard factors={factors} />);

    expect(screen.getByText('20 points below expected')).toBeInTheDocument();
  });

  it('renders empty state with green checkmark and message', () => {
    render(<RiskFactorsCard factors={[]} />);

    const emptyState = screen.getByTestId('empty-state');
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveTextContent('✓');
    expect(emptyState).toHaveTextContent('No risk factors identified');
  });

  it('renders loading skeleton when isLoading=true', () => {
    render(<RiskFactorsCard factors={[]} isLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Risk Factors')).toBeInTheDocument();
  });

  it('custom empty message via emptyMessage prop', () => {
    render(<RiskFactorsCard factors={[]} emptyMessage="All clear!" />);

    expect(screen.getByText('All clear!')).toBeInTheDocument();
  });

  it('orders factors by severity (high first)', () => {
    const factors = [
      createMockRiskFactor({ id: 'r1', severity: 'low', factor: 'Minor issue' }),
      createMockRiskFactor({ id: 'r2', severity: 'high', factor: 'Critical issue' }),
      createMockRiskFactor({ id: 'r3', severity: 'medium', factor: 'Moderate issue' }),
    ];
    render(<RiskFactorsCard factors={factors} />);

    const items = screen.getAllByTestId('risk-factor-item');
    expect(items[0]).toHaveTextContent('Critical issue');
    expect(items[1]).toHaveTextContent('Moderate issue');
    expect(items[2]).toHaveTextContent('Minor issue');
  });

  it('renders high severity icon (warning)', () => {
    const factors = [createMockRiskFactor({ severity: 'high' })];
    render(<RiskFactorsCard factors={factors} />);

    const badge = screen.getByTestId('severity-badge');
    expect(badge).toHaveTextContent('⚠');
  });
});
