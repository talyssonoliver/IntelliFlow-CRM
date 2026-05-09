// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ChurnRiskCard } from '../src/components/intelligence/ChurnRiskCard';
import { NextBestActionCard } from '../src/components/intelligence/NextBestActionCard';

// ──────────────────────────────────────────────────────────────────────────────
// ChurnRiskCard
// ──────────────────────────────────────────────────────────────────────────────

const churnRiskBase = {
  score: 75,
  level: 'HIGH' as const,
};

describe('ChurnRiskCard', () => {
  it('renders without crashing', () => {
    const { container } = render(<ChurnRiskCard data={churnRiskBase} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    render(<ChurnRiskCard data={churnRiskBase} isLoading />);
    // Loading state renders skeletons
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders score', () => {
    render(<ChurnRiskCard data={churnRiskBase} />);
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('renders CRITICAL risk level', () => {
    render(<ChurnRiskCard data={{ score: 95, level: 'CRITICAL' }} />);
    expect(screen.getByText('95')).toBeInTheDocument();
  });

  it('renders MEDIUM risk level', () => {
    render(<ChurnRiskCard data={{ score: 50, level: 'MEDIUM' }} />);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders LOW risk level', () => {
    render(<ChurnRiskCard data={{ score: 20, level: 'LOW' }} />);
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('renders MINIMAL risk level', () => {
    render(<ChurnRiskCard data={{ score: 5, level: 'MINIMAL' }} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<ChurnRiskCard data={churnRiskBase} title="Churn Risk" />);
    expect(screen.getByText('Churn Risk')).toBeInTheDocument();
  });

  it('renders confidence when showConfidence is true', () => {
    render(<ChurnRiskCard data={{ ...churnRiskBase, confidence: 0.85 }} showConfidence />);
    expect(screen.getByText(/85/)).toBeInTheDocument();
  });

  it('renders SLA hours when showSLA is true', () => {
    render(<ChurnRiskCard data={{ ...churnRiskBase, slaHours: 4 }} showSLA />);
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });

  it('renders risk factors when showFactors is true', () => {
    const factors = [
      { factor: 'No logins in 30 days', impact: 'HIGH' as const },
      { factor: 'Support tickets', impact: 'MEDIUM' as const },
    ];
    render(<ChurnRiskCard data={{ ...churnRiskBase, factors }} showFactors />);
    expect(screen.getByText('No logins in 30 days')).toBeInTheDocument();
  });

  it('renders IMPROVING trend', () => {
    render(<ChurnRiskCard data={{ ...churnRiskBase, trend: 'IMPROVING' }} />);
    // Trend icon rendered — component should not crash
    const { container } = render(<ChurnRiskCard data={{ ...churnRiskBase, trend: 'IMPROVING' }} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders DECLINING trend', () => {
    const { container } = render(<ChurnRiskCard data={{ ...churnRiskBase, trend: 'DECLINING' }} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders STABLE trend', () => {
    const { container } = render(<ChurnRiskCard data={{ ...churnRiskBase, trend: 'STABLE' }} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('calls onRefresh when refresh button clicked', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<ChurnRiskCard data={churnRiskBase} onRefresh={onRefresh} />);
    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('renders sm size variant', () => {
    const { container } = render(<ChurnRiskCard data={churnRiskBase} size="sm" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders lg size variant', () => {
    const { container } = render(<ChurnRiskCard data={churnRiskBase} size="lg" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders assessedAt date', () => {
    const { container } = render(
      <ChurnRiskCard data={{ ...churnRiskBase, assessedAt: '2026-01-01T00:00:00Z' }} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders factor with value', () => {
    const factors = [{ factor: 'Revenue', impact: 'HIGH' as const, value: '$1,000' }];
    render(<ChurnRiskCard data={{ ...churnRiskBase, factors }} showFactors />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// NextBestActionCard
// ──────────────────────────────────────────────────────────────────────────────

const nbaBase = {
  actionType: 'CALL' as const,
  title: 'Schedule a call',
  priority: 'HIGH' as const,
};

describe('NextBestActionCard', () => {
  it('renders without crashing', () => {
    const { container } = render(<NextBestActionCard data={nbaBase} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    render(<NextBestActionCard data={nbaBase} isLoading />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders action title', () => {
    render(<NextBestActionCard data={nbaBase} />);
    expect(screen.getByText('Schedule a call')).toBeInTheDocument();
  });

  it('renders custom card title', () => {
    render(<NextBestActionCard data={nbaBase} title="AI Recommendation" />);
    expect(screen.getByText('AI Recommendation')).toBeInTheDocument();
  });

  it('renders rationale when showRationale is true', () => {
    render(
      <NextBestActionCard
        data={{ ...nbaBase, rationale: 'Customer engagement dropping' }}
        showRationale
      />
    );
    expect(screen.getByText('Customer engagement dropping')).toBeInTheDocument();
  });

  it('renders confidence when showConfidence is true', () => {
    render(<NextBestActionCard data={{ ...nbaBase, confidence: 0.92 }} showConfidence />);
    expect(screen.getByText(/92/)).toBeInTheDocument();
  });

  it('renders success probability when showSuccessProbability is true', () => {
    render(
      <NextBestActionCard data={{ ...nbaBase, successProbability: 0.75 }} showSuccessProbability />
    );
    expect(screen.getByText(/75/)).toBeInTheDocument();
  });

  it('renders deadline', () => {
    const { container } = render(
      <NextBestActionCard data={{ ...nbaBase, deadline: '2026-12-31T00:00:00Z' }} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('calls onActionTaken when mark done button clicked', async () => {
    const onActionTaken = vi.fn();
    const user = userEvent.setup();
    render(<NextBestActionCard data={nbaBase} onActionTaken={onActionTaken} />);
    const doneBtn = screen.getByRole('button', { name: /mark done/i });
    await user.click(doneBtn);
    expect(onActionTaken).toHaveBeenCalled();
  });

  it('calls onDismiss when dismiss button clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<NextBestActionCard data={nbaBase} onDismiss={onDismiss} />);
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders EMAIL action type', () => {
    const { container } = render(
      <NextBestActionCard data={{ ...nbaBase, actionType: 'EMAIL', title: 'Send email' }} />
    );
    expect(screen.getByText('Send email')).toBeInTheDocument();
  });

  it('renders MEETING action type', () => {
    const { container } = render(
      <NextBestActionCard data={{ ...nbaBase, actionType: 'MEETING', title: 'Book meeting' }} />
    );
    expect(screen.getByText('Book meeting')).toBeInTheDocument();
  });

  it('renders CRITICAL priority', () => {
    const { container } = render(
      <NextBestActionCard data={{ ...nbaBase, priority: 'CRITICAL' }} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders LOW priority', () => {
    const { container } = render(<NextBestActionCard data={{ ...nbaBase, priority: 'LOW' }} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders sm size', () => {
    const { container } = render(<NextBestActionCard data={nbaBase} size="sm" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders lg size', () => {
    const { container } = render(<NextBestActionCard data={nbaBase} size="lg" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
