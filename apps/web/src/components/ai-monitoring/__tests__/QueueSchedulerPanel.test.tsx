/**
 * @vitest-environment jsdom
 * QueueSchedulerPanel Component Tests — IFC-296
 *
 * Categories:
 *   1. Rendering (7 tests)
 *   2. Data Display (6 tests)
 *   3. Interactions (5 tests)
 *   4. Error/Loading States (4 tests)
 *   5. Accessibility (5 tests)
 *
 * Total: ~27 tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type {
  QueueSchedulerPanelProps,
  QueueSchedulerData,
  SchedulerQueueName,
} from '@/lib/ai-monitoring/types';

// ---------------------------------------------------------------------------
// UI Mocks
// ---------------------------------------------------------------------------

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  Card: ({
    children,
    className,
    ...props
  }: Readonly<{ children: React.ReactNode; className?: string; [k: string]: unknown }>) => (
    <div data-testid="card" className={className} {...props}>
      {children}
    </div>
  ),
  CardContent: ({
    children,
    className,
    ...props
  }: Readonly<{ children: React.ReactNode; className?: string; [k: string]: unknown }>) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  CardHeader: ({
    children,
    className,
    ...props
  }: Readonly<{ children: React.ReactNode; className?: string; [k: string]: unknown }>) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  CardTitle: ({
    children,
    className,
    ...props
  }: Readonly<{ children: React.ReactNode; className?: string; [k: string]: unknown }>) => (
    <h3 className={className} {...props}>
      {children}
    </h3>
  ),
  Button: ({
    children,
    className,
    disabled,
    onClick,
    ...props
  }: Readonly<{
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
    [k: string]: unknown;
  }>) => (
    <button className={className} disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Skeleton: ({ className, ...props }: Readonly<{ className?: string; [k: string]: unknown }>) => (
    <div data-testid="skeleton" className={className} {...props} />
  ),
  Badge: ({
    children,
    className,
    ...props
  }: Readonly<{ children: React.ReactNode; className?: string; [k: string]: unknown }>) => (
    <span data-testid="badge" className={className} {...props}>
      {children}
    </span>
  ),
  Tooltip: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
  TooltipContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <span>{children}</span>
  ),
  TooltipProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild: _asChild,
  }: Readonly<{ children: React.ReactNode; asChild?: boolean }>) => <>{children}</>,
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Import component AFTER mocks
import { QueueSchedulerPanel } from '../QueueSchedulerPanel';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

function createMockQueueData(overrides?: Partial<QueueSchedulerData>): QueueSchedulerData {
  return {
    queues: [
      {
        name: 'ai-scoring' as SchedulerQueueName,
        isPaused: false,
        counts: { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 },
        schedulers: [
          {
            id: 'sched-1',
            name: 'scheduled-lead-scoring',
            pattern: '0 */4 * * *',
            next: Date.now() + 3600000,
          },
        ],
      },
      {
        name: 'ai-prediction' as SchedulerQueueName,
        isPaused: false,
        counts: { waiting: 0, active: 0, completed: 50, failed: 0, delayed: 0 },
        schedulers: [],
      },
      {
        name: 'ai-insights' as SchedulerQueueName,
        isPaused: true,
        counts: { waiting: 10, active: 0, completed: 200, failed: 5, delayed: 2 },
        schedulers: [
          {
            id: 'sched-2',
            name: 'scheduled-insight-refresh',
            pattern: '0 */6 * * *',
            next: Date.now() + 7200000,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createMockProps(overrides?: Partial<QueueSchedulerPanelProps>): QueueSchedulerPanelProps {
  return {
    data: createMockQueueData(),
    isLoading: false,
    isUnavailable: false,
    isPending: {},
    onPause: vi.fn(),
    onResume: vi.fn(),
    onRetryFailed: vi.fn(),
    onDeleteScheduler: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QueueSchedulerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Category 1 — Rendering
  // =========================================================================
  describe('Category 1: Rendering', () => {
    it('renders panel heading "Queue Scheduler"', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);
      expect(screen.getByText('Queue Scheduler')).toBeInTheDocument();
    });

    it('renders 3 queue rows (ai-scoring, ai-prediction, ai-insights)', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      expect(screen.getByTestId('queue-row-ai-scoring')).toBeInTheDocument();
      expect(screen.getByTestId('queue-row-ai-prediction')).toBeInTheDocument();
      expect(screen.getByTestId('queue-row-ai-insights')).toBeInTheDocument();
    });

    it('renders Pause button for active queues', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      // ai-scoring is active (isPaused: false), should have Pause button
      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      expect(within(scoringRow).getByTestId('action-pause-ai-scoring')).toBeInTheDocument();
    });

    it('renders Resume button for paused queues', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      // ai-insights is paused, should have Resume button
      const insightsRow = screen.getByTestId('queue-row-ai-insights');
      expect(within(insightsRow).getByTestId('action-resume-ai-insights')).toBeInTheDocument();
    });

    it('renders Retry Failed button per queue', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      expect(within(scoringRow).getByLabelText(/Retry failed/i)).toBeInTheDocument();
    });

    it('renders Delete Scheduler button for queues with schedulers', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      // ai-scoring has a scheduler, should have delete button
      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      expect(within(scoringRow).getByLabelText(/Delete scheduler/i)).toBeInTheDocument();

      // ai-prediction has no schedulers, should NOT have delete button
      const predictionRow = screen.getByTestId('queue-row-ai-prediction');
      expect(within(predictionRow).queryByLabelText(/Delete scheduler/i)).not.toBeInTheDocument();
    });

    it('renders refresh button', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);
      expect(screen.getByLabelText('Refresh queue data')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Category 2 — Data Display
  // =========================================================================
  describe('Category 2: Data Display', () => {
    it('displays waiting, active, completed, failed counts per queue', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      expect(within(scoringRow).getByText('5')).toBeInTheDocument(); // waiting
      expect(within(scoringRow).getByText('2')).toBeInTheDocument(); // active
      expect(within(scoringRow).getByText('100')).toBeInTheDocument(); // completed
      expect(within(scoringRow).getByText('3')).toBeInTheDocument(); // failed
    });

    it('shows "Paused" badge when isPaused is true', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      const insightsRow = screen.getByTestId('queue-row-ai-insights');
      expect(within(insightsRow).getByText('Paused')).toBeInTheDocument();
    });

    it('shows "Active" badge when isPaused is false', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      expect(within(scoringRow).getByText('Active')).toBeInTheDocument();
    });

    it('displays cron pattern string for schedulers', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      expect(within(scoringRow).getByText(/0 \*\/4 \* \* \*/)).toBeInTheDocument();
    });

    it('formats zero counts as "0" not blank', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      // ai-prediction has all zeros
      const predictionRow = screen.getByTestId('queue-row-ai-prediction');
      const zeros = within(predictionRow).getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(3); // waiting, active, failed, delayed
    });

    it('each queue row has data-testid="queue-row-{name}"', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      expect(screen.getByTestId('queue-row-ai-scoring')).toBeInTheDocument();
      expect(screen.getByTestId('queue-row-ai-prediction')).toBeInTheDocument();
      expect(screen.getByTestId('queue-row-ai-insights')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Category 3 — Interactions
  // =========================================================================
  describe('Category 3: Interactions', () => {
    it('clicking Pause calls onPause with queue name', () => {
      const props = createMockProps();
      render(<QueueSchedulerPanel {...props} />);

      fireEvent.click(screen.getByTestId('action-pause-ai-scoring'));
      expect(props.onPause).toHaveBeenCalledWith('ai-scoring');
    });

    it('clicking Resume calls onResume with queue name', () => {
      const props = createMockProps();
      render(<QueueSchedulerPanel {...props} />);

      fireEvent.click(screen.getByTestId('action-resume-ai-insights'));
      expect(props.onResume).toHaveBeenCalledWith('ai-insights');
    });

    it('clicking Retry Failed calls onRetryFailed with queue name', () => {
      const props = createMockProps();
      render(<QueueSchedulerPanel {...props} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      const retryBtn = within(scoringRow).getByLabelText(/Retry failed/i);
      fireEvent.click(retryBtn);
      expect(props.onRetryFailed).toHaveBeenCalledWith('ai-scoring');
    });

    it('clicking Delete Scheduler calls onDeleteScheduler with queue name and schedulerId', () => {
      const props = createMockProps();
      render(<QueueSchedulerPanel {...props} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      const deleteBtn = within(scoringRow).getByLabelText(/Delete scheduler/i);
      fireEvent.click(deleteBtn);
      expect(props.onDeleteScheduler).toHaveBeenCalledWith('ai-scoring', 'sched-1');
    });

    it('clicking refresh button calls onRefresh', () => {
      const props = createMockProps();
      render(<QueueSchedulerPanel {...props} />);

      fireEvent.click(screen.getByLabelText('Refresh queue data'));
      expect(props.onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Category 4 — Error/Loading States
  // =========================================================================
  describe('Category 4: Error/Loading States', () => {
    it('shows skeleton when isLoading is true', () => {
      render(<QueueSchedulerPanel {...createMockProps({ isLoading: true, data: null })} />);

      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByTestId('queue-row-ai-scoring')).not.toBeInTheDocument();
    });

    it('shows unavailable message when isUnavailable is true', () => {
      render(<QueueSchedulerPanel {...createMockProps({ isUnavailable: true, data: null })} />);

      expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    });

    it('shows empty data state when data is null and not loading', () => {
      render(<QueueSchedulerPanel {...createMockProps({ data: null })} />);

      // EmptyState entity="agents" → canonical 'No active agents' (semantic
      // misuse for the queue panel — dedicated 'queue' entity worth a follow-up).
      expect(screen.getByText(/no active agents/i)).toBeInTheDocument();
    });

    it('action buttons disabled when mutation is in flight', () => {
      const props = createMockProps({
        isPending: { 'ai-scoring': true },
      });
      render(<QueueSchedulerPanel {...props} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      const pauseBtn = within(scoringRow).getByTestId('action-pause-ai-scoring');
      expect(pauseBtn).toBeDisabled();
    });
  });

  // =========================================================================
  // Category 5 — Accessibility
  // =========================================================================
  describe('Category 5: Accessibility', () => {
    it('Pause button has aria-label "Pause {queueName} queue"', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);
      expect(screen.getByLabelText('Pause ai-scoring queue')).toBeInTheDocument();
    });

    it('Resume button has aria-label "Resume {queueName} queue"', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);
      expect(screen.getByLabelText('Resume ai-insights queue')).toBeInTheDocument();
    });

    it('Retry button has aria-label "Retry failed jobs in {queueName}"', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);
      expect(screen.getByLabelText('Retry failed jobs in ai-scoring')).toBeInTheDocument();
    });

    it('Delete Scheduler button has aria-label "Delete scheduler {schedulerId}"', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);
      expect(screen.getByLabelText('Delete scheduler sched-1')).toBeInTheDocument();
    });

    it('status badge has aria-label with queue state', () => {
      render(<QueueSchedulerPanel {...createMockProps()} />);

      const scoringRow = screen.getByTestId('queue-row-ai-scoring');
      expect(within(scoringRow).getByLabelText(/ai-scoring.*active/i)).toBeInTheDocument();
    });
  });
});
