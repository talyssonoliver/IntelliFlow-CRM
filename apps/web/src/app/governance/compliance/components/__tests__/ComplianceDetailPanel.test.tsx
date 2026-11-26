/**
 * ComplianceDetailPanel Component Tests (PG-194)
 *
 * The panel shows the framework it is given (from the compliance router) and that framework's
 * stored history. It holds no scores of its own.
 *
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FrameworkView } from '../compliance-view';

const historyState = vi.hoisted(() => ({
  data: { points: [] as unknown[] } as { points: unknown[] } | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const historyUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@/lib/trpc', () => ({
  trpc: {
    compliance: {
      history: {
        useQuery: (...args: unknown[]) => {
          historyUseQuery(...args);
          return historyState;
        },
      },
    },
  },
}));

import { ComplianceDetailPanel, buildChartPoints, describeChanges } from '../ComplianceDetailPanel';

const framework: FrameworkView = {
  id: 'gdpr',
  title: 'GDPR',
  subtitle: 'Data Protection',
  icon: 'gavel',
  scope: 'Share of the controls the product can measure that pass.',
  score: 50,
  status: 'critical',
  counts: { passing: 1, attention: 1, notMeasured: 1 },
  details: [],
  trend: { state: 'pending', reason: 'Trend starts tomorrow' },
  controls: [
    {
      id: 'art12-sla',
      name: 'Data requests answered on time',
      state: 'attention',
      evidence: '2 open, 1 past their deadline; 0 answered late in the last 12 months.',
      actionHref: '/settings/privacy-requests',
      actionLabel: 'Open data requests',
    },
    {
      id: 'terms-acceptance',
      name: 'Terms accepted by users',
      state: 'pass',
      evidence: '4 of 4 users have an acceptance record.',
    },
    {
      id: 'art28-dpa',
      name: 'Data processing agreement signed',
      state: 'not_measured',
      evidence: 'DPA signatures are not stored per firm.',
      needed: 'A signature record per firm with the DPA version it signed.',
    },
  ],
};

const point = (day: string, score: number | null, passing = 1, attention = 1) => ({
  day,
  score,
  passing,
  attention,
  notMeasured: 0,
});

describe('ComplianceDetailPanel', () => {
  beforeEach(() => {
    historyState.data = { points: [] };
    historyState.isLoading = false;
    historyState.isError = false;
    historyState.refetch.mockClear();
    historyUseQuery.mockClear();
  });

  it('asks to select a standard when none is chosen', () => {
    render(<ComplianceDetailPanel framework={null} open onClose={() => undefined} />);
    expect(screen.getByText('Select a compliance standard to view details')).toBeInTheDocument();
  });

  it('shows the framework, its status and its score', () => {
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    expect(screen.getByText('GDPR')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Trend starts tomorrow')).toBeInTheDocument();
  });

  it('shows Not measured, never a number, for a framework with no score', () => {
    render(
      <ComplianceDetailPanel
        framework={{ ...framework, score: null, status: 'not_measured' }}
        open
        onClose={() => undefined}
      />
    );
    expect(screen.getAllByText('Not measured').length).toBeGreaterThan(0);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('lists every control with its evidence, what is needed, and a link to act', () => {
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    expect(screen.getByText('Data requests answered on time')).toBeInTheDocument();
    expect(screen.getByText(/2 open, 1 past their deadline/)).toBeInTheDocument();
    expect(screen.getByText(/Needed to measure: A signature record per firm/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /open data requests/i });
    expect(link).toHaveAttribute('href', '/settings/privacy-requests');
  });

  it('counts controls by state', () => {
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    for (const label of ['Pass', 'Attention', 'Not measured']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('asks for history of the selected framework only while open', () => {
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    expect(historyUseQuery).toHaveBeenCalledWith({ frameworkId: 'gdpr' }, { enabled: true });
  });

  it('says the trend starts tomorrow in History until two days are stored', async () => {
    historyState.data = { points: [point('2026-11-23', 50)] };
    const user = userEvent.setup();
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'history' }));
    expect(
      screen.getByText(/Trend starts tomorrow\. A point is stored each day/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Score by day', { selector: 'title' })).not.toBeInTheDocument();
  });

  it('draws the stored history once two days exist', async () => {
    historyState.data = { points: [point('2026-11-22', 40), point('2026-11-23', 60)] };
    const user = userEvent.setup();
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'history' }));
    expect(screen.getByText('Score by day', { selector: 'title' })).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('shows changes between stored days, and says so when there are none', async () => {
    historyState.data = { points: [point('2026-11-22', 40, 1, 2), point('2026-11-23', 60, 2, 1)] };
    const user = userEvent.setup();
    const { unmount } = render(
      <ComplianceDetailPanel framework={framework} open onClose={() => undefined} />
    );
    await user.click(screen.getByRole('button', { name: 'changes' }));
    expect(screen.getByText('Passing 1 to 2, needing attention 2 to 1.')).toBeInTheDocument();
    unmount();

    historyState.data = { points: [] };
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'changes' }));
    expect(screen.getByText('No change between stored days yet.')).toBeInTheDocument();
  });

  it('reports a failed history request instead of claiming the history is empty', async () => {
    historyState.data = undefined;
    historyState.isError = true;
    const user = userEvent.setup();
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'history' }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByText(/A point is stored each day/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(historyState.refetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByText('No change between stored days yet.')).not.toBeInTheDocument();
  });

  it('labels a stored day as the same calendar date in any timezone', async () => {
    historyState.data = { points: [point('2026-11-22', 40), point('2026-11-23', 60)] };
    const user = userEvent.setup();
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'history' }));
    expect(screen.getByText('22 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('23 Nov 2026')).toBeInTheDocument();
  });

  it('shows a loading note while history loads', async () => {
    historyState.data = undefined;
    historyState.isLoading = true;
    const user = userEvent.setup();
    render(<ComplianceDetailPanel framework={framework} open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'history' }));
    expect(screen.getByText('Loading history')).toBeInTheDocument();
  });
});

describe('buildChartPoints / describeChanges', () => {
  it('needs two scored days to draw a line', () => {
    expect(buildChartPoints([point('2026-11-23', 50)])).toEqual([]);
    expect(buildChartPoints([point('2026-11-22', null), point('2026-11-23', 50)])).toEqual([]);
    expect(buildChartPoints([point('2026-11-22', 0), point('2026-11-23', 100)])).toHaveLength(2);
  });

  it('lists only the days on which the counts changed, newest first', () => {
    const changes = describeChanges([
      point('2026-11-20', 50, 1, 1),
      point('2026-11-21', 50, 1, 1),
      point('2026-11-22', 70, 2, 1),
      point('2026-11-23', 40, 1, 2),
    ]);
    expect(changes.map((c) => c.day)).toEqual(['2026-11-23', '2026-11-22']);
  });
});
