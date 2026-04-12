/**
 * @vitest-environment jsdom
 * ForecastHeader Component Tests (PG-131)
 * AC-008: Renders appropriate breadcrumbs, title, and actions for both modes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForecastHeader } from '../forecast/ForecastHeader';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: Readonly<{ children: React.ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Badge: ({ children, ...props }: Readonly<{ children: React.ReactNode }>) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

// Mock EntityHeader — capture props to verify them
const mockEntityHeader = vi.fn();
vi.mock('@/components/shared', () => ({
  EntityHeader: (props: Record<string, unknown>) => {
    mockEntityHeader(props);
    return (
      <div data-testid="entity-header">
        <span data-testid="entity-title">{String(props.title)}</span>
        {(props.breadcrumbs as { label: string; href?: string }[])?.map(
          (bc: { label: string; href?: string }, i: number) => (
            <span key={i} data-testid="breadcrumb">
              {bc.href ? <a href={bc.href}>{bc.label}</a> : bc.label}
            </span>
          )
        )}
        {(props.badges as { label: string }[])?.map((b: { label: string }, i: number) => (
          <span key={i} data-testid="header-badge">
            {b.label}
          </span>
        ))}
        {(props.actions as { label: string; onClick?: () => void }[])?.map(
          (a: { label: string; onClick?: () => void }, i: number) => (
            <button key={i} data-testid="header-action" onClick={a.onClick}>
              {a.label}
            </button>
          )
        )}
      </div>
    );
  },
}));

// Mock PIPELINE_STAGE_CONFIG for stage label lookup
vi.mock('../forecast/types', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    PIPELINE_STAGE_CONFIG: {
      PROSPECTING: { label: 'Prospecting' },
      QUALIFICATION: { label: 'Qualification' },
      NEEDS_ANALYSIS: { label: 'Needs Analysis' },
      PROPOSAL: { label: 'Proposal' },
      NEGOTIATION: { label: 'Negotiation' },
      CLOSED_WON: { label: 'Closed Won' },
      CLOSED_LOST: { label: 'Closed Lost' },
    },
  };
});

describe('ForecastHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders portfolio mode breadcrumbs "Deals > Forecast"', () => {
    render(<ForecastHeader mode="portfolio" quarter="Q1 2026" />);

    const breadcrumbs = screen.getAllByTestId('breadcrumb');
    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toHaveTextContent('Deals');
    expect(breadcrumbs[1]).toHaveTextContent('Forecast');
  });

  it('renders deal mode breadcrumbs "Deals > {dealName} > Forecast"', () => {
    render(
      <ForecastHeader
        mode="deal"
        dealName="Acme Corp"
        dealId="deal-001"
        dealStage="PROPOSAL"
        quarter="Q1 2026"
      />
    );

    const breadcrumbs = screen.getAllByTestId('breadcrumb');
    expect(breadcrumbs).toHaveLength(3);
    expect(breadcrumbs[0]).toHaveTextContent('Deals');
    expect(breadcrumbs[1]).toHaveTextContent('Acme Corp');
    expect(breadcrumbs[2]).toHaveTextContent('Forecast');
  });

  it('shows quarter badge in portfolio mode', () => {
    render(<ForecastHeader mode="portfolio" quarter="Q1 2026" />);

    expect(screen.getByText('Q1 2026')).toBeInTheDocument();
  });

  it('shows stage badge in deal mode', () => {
    render(
      <ForecastHeader
        mode="deal"
        dealName="Test Deal"
        dealId="deal-001"
        dealStage="PROPOSAL"
        quarter="Q1 2026"
      />
    );

    expect(screen.getByText('Proposal')).toBeInTheDocument();
  });

  it('renders export button when onExport provided', () => {
    const onExport = vi.fn();
    render(<ForecastHeader mode="portfolio" quarter="Q1 2026" onExport={onExport} />);

    const exportBtn = screen.getByText('Export');
    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('shows live count in portfolio mode', () => {
    render(<ForecastHeader mode="portfolio" quarter="Q1 2026" liveCount={42} />);

    expect(screen.getByTestId('live-count')).toHaveTextContent('42 active opportunities');
  });

  it('shows win rate in portfolio mode', () => {
    render(<ForecastHeader mode="portfolio" quarter="Q1 2026" winRate={35} />);

    expect(screen.getByTestId('win-rate')).toHaveTextContent('Win rate: 35%');
  });

  it('omits portfolio-only fields in deal mode', () => {
    render(
      <ForecastHeader
        mode="deal"
        dealName="Deal"
        dealId="d-1"
        dealStage="NEGOTIATION"
        quarter="Q1 2026"
        liveCount={10}
        winRate={20}
      />
    );

    expect(screen.queryByTestId('live-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('win-rate')).not.toBeInTheDocument();
  });
});
