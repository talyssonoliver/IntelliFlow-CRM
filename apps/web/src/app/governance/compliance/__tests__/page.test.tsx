/**
 * Compliance Dashboard Page Tests (PG-194)
 *
 * Every figure on the page comes from the `compliance` tRPC router. These tests drive the page
 * with router fixtures and prove that what is shown is what the router said, that a framework
 * with no evidence shows "Not measured" and never a number, and that the page source holds no
 * literal scores.
 *
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  overview: {
    data: undefined as unknown,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  refresh: { mutate: vi.fn(), isPending: false },
  invalidate: vi.fn(),
}));

const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      compliance: {
        overview: { invalidate: state.invalidate, fetch: vi.fn() },
        history: { invalidate: state.invalidate },
      },
    }),
    analytics: {
      recentActivity: {
        useQuery: () => ({
          data: [
            {
              id: 'act-1',
              description: 'Audit completed for ISO 27001',
              actorName: 'Alice Compliance',
              createdAt: twoHoursAgo,
            },
          ],
        }),
      },
    },
    compliance: {
      overview: { useQuery: () => state.overview },
      refresh: { useMutation: () => state.refresh },
      history: { useQuery: () => ({ data: { points: [] }, isLoading: false }) },
    },
  },
}));

vi.mock('../components', () => ({
  RiskHeatMap: () => <div data-testid="risk-heat-map" />,
  ComplianceTimeline: () => <div data-testid="timeline" />,
  ExportReportButton: ({ label = 'Export Report' }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
  ComplianceDetailPanel: ({
    framework,
    open,
  }: {
    framework: { id: string } | null;
    open: boolean;
  }) => (open ? <div data-testid="detail-panel">{framework?.id}</div> : null),
}));

import ComplianceDashboardPage from '../page';

const pending = { state: 'pending', reason: 'Trend starts tomorrow' };

function framework(over: Record<string, unknown>) {
  return {
    id: 'gdpr',
    title: 'GDPR',
    subtitle: 'Data Protection',
    icon: 'gavel',
    scope: 'Scope line.',
    score: 80,
    status: 'attention',
    controls: [],
    details: [
      { label: 'Open Requests', value: '2 (1 overdue)' },
      { label: 'Active Restrictions', value: '1' },
    ],
    counts: { passing: 4, attention: 1, notMeasured: 3 },
    trend: pending,
    ...over,
  };
}

const overviewFixture = {
  generatedAt: '2026-11-23T10:00:00.000Z',
  overall: {
    score: 77,
    measuredFrameworks: 2,
    totalFrameworks: 5,
    actionItems: 4,
    notMeasuredControls: 6,
  },
  frameworks: [
    framework({
      id: 'iso-27001',
      title: 'ISO 27001',
      subtitle: 'InfoSec',
      score: 74,
      status: 'attention',
      trend: { state: 'available', delta: -6, since: '2026-11-01' },
      details: [{ label: 'MFA Adoption', value: '3 of 5 users' }],
    }),
    framework({
      id: 'iso-42001',
      title: 'ISO 42001',
      subtitle: 'AI Mgmt',
      score: 100,
      status: 'compliant',
      trend: { state: 'available', delta: 4, since: '2026-11-01' },
    }),
    framework({
      id: 'iso-14001',
      title: 'ISO 14001',
      subtitle: 'Environment',
      score: null,
      status: 'not_measured',
      details: [
        { label: 'Status', value: 'Not measured' },
        { label: 'Needs', value: 'An environmental policy recorded per firm.' },
      ],
    }),
    framework({}),
    framework({
      id: 'adr-registry',
      title: 'ADR Registry',
      subtitle: 'Architecture',
      score: null,
      status: 'not_measured',
      details: [],
    }),
  ],
};

describe('ComplianceDashboardPage', () => {
  beforeEach(() => {
    state.overview = {
      data: overviewFixture,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    state.refresh = { mutate: vi.fn(), isPending: false };
    state.invalidate.mockReset();
  });

  it('renders the header, the buttons and the recent activity', () => {
    render(<ComplianceDashboardPage />);
    expect(screen.getByRole('heading', { name: 'Compliance Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export report/i })).toBeInTheDocument();
    expect(screen.getByText('Audit completed for ISO 27001')).toBeInTheDocument();
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    expect(screen.getByText(/Not a certification or legal advice/)).toBeInTheDocument();
  });

  it('shows every framework card, none dropped', () => {
    render(<ComplianceDashboardPage />);
    for (const title of ['ISO 27001', 'ISO 42001', 'ISO 14001', 'GDPR', 'ADR Registry']) {
      expect(
        screen.getByTestId(`framework-${title.toLowerCase().replaceAll(' ', '-')}`)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `${title} details` })).toBeInTheDocument();
    }
  });

  it('shows the scores, statuses and detail lines the router returned', () => {
    render(<ComplianceDashboardPage />);
    const card = screen.getByTestId('framework-iso-27001');
    expect(within(card).getByText('74%')).toBeInTheDocument();
    expect(within(card).getByText('Attention')).toBeInTheDocument();
    expect(within(card).getByText('3 of 5 users')).toBeInTheDocument();
    const compliant = screen.getByTestId('framework-iso-42001');
    expect(within(compliant).getByText('100%')).toBeInTheDocument();
    expect(within(compliant).getByText('Compliant')).toBeInTheDocument();
  });

  it('shows Not measured, with what is needed, and no percentage for a framework without evidence', () => {
    render(<ComplianceDashboardPage />);
    const card = screen.getByTestId('framework-iso-14001');
    expect(within(card).getAllByText('Not measured').length).toBeGreaterThan(0);
    expect(
      within(card).getByText('An environmental policy recorded per firm.')
    ).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\d%/);
  });

  it('shows a trend only from stored history, and "Trend starts tomorrow" otherwise', () => {
    render(<ComplianceDashboardPage />);
    expect(
      within(screen.getByTestId('framework-iso-27001')).getByText('-6 pts')
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('framework-iso-42001')).getByText('+4 pts')
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('framework-gdpr')).getByText('Trend starts tomorrow')
    ).toBeInTheDocument();
  });

  it('shows the overall figures from the router, with how many frameworks they cover', () => {
    render(<ComplianceDashboardPage />);
    expect(screen.getByText('Overall Score')).toBeInTheDocument();
    expect(screen.getByText('77')).toBeInTheDocument();
    expect(screen.getByText('2 of 5 frameworks measured')).toBeInTheDocument();
    expect(screen.getByText('4 to review')).toBeInTheDocument();
    // Mean of the two available deltas, -6 and +4.
    expect(screen.getByText('-1 pts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Full Report' })).toBeInTheDocument();
  });

  it('shows Not measured for the overall score when nothing could be measured', () => {
    state.overview = {
      ...state.overview,
      data: {
        ...overviewFixture,
        overall: { ...overviewFixture.overall, score: null, measuredFrameworks: 0 },
        frameworks: overviewFixture.frameworks.map((f) => ({
          ...f,
          score: null,
          status: 'not_measured',
          trend: pending,
        })),
      },
    };
    render(<ComplianceDashboardPage />);
    expect(screen.getByText('0 of 5 frameworks measured')).toBeInTheDocument();
    expect(screen.getAllByText('Trend starts tomorrow').length).toBeGreaterThan(0);
    expect(screen.queryByText('Score')).not.toBeInTheDocument();
  });

  it('opens the detail panel for the clicked framework, by mouse and keyboard', async () => {
    const user = userEvent.setup();
    render(<ComplianceDashboardPage />);
    expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'GDPR details' }));
    expect(screen.getByTestId('detail-panel')).toHaveTextContent('gdpr');

    screen.getByRole('button', { name: 'ISO 27001 details' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('detail-panel')).toHaveTextContent('iso-27001');
  });

  it('refreshes: stores a snapshot through the router', async () => {
    const user = userEvent.setup();
    render(<ComplianceDashboardPage />);
    await user.click(screen.getByRole('button', { name: /refresh data/i }));
    expect(state.refresh.mutate).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton while loading', () => {
    state.overview = { ...state.overview, data: undefined };
    render(<ComplianceDashboardPage />);
    expect(screen.getByLabelText('Loading compliance data')).toBeInTheDocument();
    expect(screen.queryByText('Overall Score')).not.toBeInTheDocument();
  });

  it('says who can see it when the router refuses', () => {
    state.overview = {
      data: undefined,
      isError: true,
      error: { data: { code: 'FORBIDDEN' } },
      refetch: vi.fn(),
    };
    render(<ComplianceDashboardPage />);
    expect(
      screen.getByText('Compliance figures are visible to administrators and managers.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh data/i })).toBeDisabled();
  });

  it('offers a retry when the figures could not be loaded', async () => {
    const refetch = vi.fn();
    state.overview = { data: undefined, isError: true, error: new Error('x'), refetch };
    const user = userEvent.setup();
    render(<ComplianceDashboardPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the risk heat map and the timeline', () => {
    render(<ComplianceDashboardPage />);
    expect(screen.getByTestId('risk-heat-map')).toBeInTheDocument();
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
  });
});

// The owner's rule (23/11/2026): never fake data. If someone types a score back into the page, this fails.
describe('compliance page source holds no literal scores', () => {
  const files = [
    join(__dirname, '..', 'page.tsx'),
    join(__dirname, '..', 'components', 'ComplianceDetailPanel.tsx'),
    join(__dirname, '..', 'components', 'ExportReportButton.tsx'),
    join(__dirname, '..', 'components', 'compliance-view.ts'),
  ];

  /** Code lines only: comment lines are skipped. */
  const codeLines = (file: string) =>
    readFileSync(file, 'utf-8')
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
      });

  /** Percent signs written right after a digit: a typed-in percentage, not a template placeholder. */
  const typedPercents = (src: string) =>
    [...src.matchAll(/%/g)].filter((m) => /\d/.test(src.charAt((m.index ?? 0) - 1)));

  it('the scan itself catches a typed-in score and ignores a computed one', () => {
    expect(typedPercents('<span>98%</span>')).toHaveLength(1);
    expect(typedPercents('<span>{`${score}%`}</span>')).toHaveLength(0);
  });

  it.each(files)('%s has no percentage or score literals', (file) => {
    const lines = codeLines(file);
    const src = lines.join('\n');
    // "92%", "74.6%" typed in a string or JSX text. A template placeholder before % is fine.
    expect(typedPercents(src)).toHaveLength(0);
    // score or trend given as a number literal.
    const literal = lines.filter(
      (l) => /\b(score|trend)=\{-?\d/.test(l) || /\b(score|trend): -?\d/.test(l)
    );
    expect(literal).toEqual([]);
    // The values the page used to hold.
    for (const typed of [
      '74.6',
      '104 / 114',
      '12 Pending',
      '4 Pending',
      '16 Total',
      'Oct 24, 2023',
      'Expiring Soon',
      '0 Reported',
      'Up to date',
      'strokeDasharray="74',
    ]) {
      expect(src).not.toContain(typed);
    }
  });

  it('page.tsx draws the gauge from the router score', () => {
    const src = readFileSync(files[0]!, 'utf-8');
    expect(src).toContain('strokeDasharray={`${overall.score}, 100`}');
  });
});
