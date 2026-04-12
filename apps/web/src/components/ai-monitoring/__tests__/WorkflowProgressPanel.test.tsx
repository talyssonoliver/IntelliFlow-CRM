/**
 * WorkflowProgressPanel tests — PG-193
 *
 * 44 tests across 6 categories: Rendering, Data Display, Interactions,
 * Edge Cases, Accessibility, and Utility Functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/lib/ai-monitoring/workflow-hooks', () => ({
  useWorkflowProgress: vi.fn(),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1', tenantId: 'tenant-1' },
  })),
}));

const { useWorkflowProgress } = vi.mocked(
  (await import('@/lib/ai-monitoring/workflow-hooks')) as any
);

import { WorkflowProgressPanel } from '../WorkflowProgressPanel';
import {
  computeProgressPercent,
  mapStepStatus,
  STEP_TYPE_LABELS,
  type WorkflowProgressData,
  type WorkflowMergedStep,
} from '@/lib/ai-monitoring/workflow-types';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

function buildSteps(): WorkflowMergedStep[] {
  return [
    { stepNumber: 1, stepId: 1, name: 'Lead Scoring', type: 'score', status: 'completed' },
    { stepNumber: 2, stepId: 2, name: 'Condition Check', type: 'condition', status: 'completed' },
    { stepNumber: 3, stepId: 3, name: 'Assignment', type: 'assign', status: 'completed' },
    { stepNumber: 4, stepId: 4, name: 'Send Notification', type: 'notify', status: 'running' },
    { stepNumber: 5, stepId: 5, name: 'Approval Gate', type: 'approval', status: 'pending' },
    { stepNumber: 6, stepId: 6, name: 'Classification', type: 'classify', status: 'pending' },
    { stepNumber: 7, stepId: 7, name: 'Routing', type: 'route', status: 'pending' },
    { stepNumber: 8, stepId: 8, name: 'SLA Assignment', type: 'sla', status: 'pending' },
  ];
}

function buildData(overrides: Partial<WorkflowProgressData> = {}): WorkflowProgressData {
  const steps = overrides.steps ?? buildSteps();
  const totalSteps = overrides.totalSteps ?? steps.length;
  const completedCount =
    overrides.completedCount ?? steps.filter((s) => s.status === 'completed').length;
  return {
    executionId: 'exec-1',
    workflowName: 'Lead Qualification',
    status: 'RUNNING',
    currentStep: 3,
    totalSteps,
    completedCount,
    completedPercent: computeProgressPercent(completedCount, totalSteps),
    steps,
    startedAt: '2026-02-17T10:00:00Z',
    completedAt: null,
    error: null,
    ...overrides,
  };
}

interface MockHookReturn {
  data: WorkflowProgressData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
}

function setupMock(overrides: Partial<MockHookReturn> = {}): MockHookReturn {
  const value: MockHookReturn = {
    data: buildData(),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
  useWorkflowProgress.mockReturnValue(value);
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMock();
});

// ===========================================================================
// Category 1: Rendering (8 tests)
// ===========================================================================

describe('WorkflowProgressPanel — Category 1: Rendering', () => {
  it('renders workflow name as panel heading', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByText('Lead Qualification')).toBeInTheDocument();
  });

  it('renders N / N step counter', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByTestId('step-counter').textContent).toContain('3 / 8');
  });

  it('renders progress bar element', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading=true', () => {
    setupMock({ data: null, isLoading: true });
    const { container } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error state with retry button when error present', () => {
    setupMock({ data: null, error: new Error('boom') });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByTestId('error-message')).toBeInTheDocument();
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  it('shows empty state when no execution data', () => {
    setupMock({ data: null });
    const { container } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(container.querySelector('[data-testid="workflow-progress-panel"]')).toBeNull();
  });

  it('renders nothing when no executionId or entity pair is provided', () => {
    const { container } = render(<WorkflowProgressPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one step row per step', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getAllByTestId('workflow-step')).toHaveLength(8);
  });

  it('renders step labels for all steps', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    for (const step of buildSteps()) {
      expect(screen.getByText(step.name)).toBeInTheDocument();
    }
  });
});

// ===========================================================================
// Category 2: Data Display (11 tests)
// ===========================================================================

describe('WorkflowProgressPanel — Category 2: Data Display', () => {
  it('progress bar has correct aria-valuenow', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '38');
  });

  it('completed steps show completed status', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    expect(rows[0]).toHaveAttribute('data-status', 'completed');
    expect(rows[1]).toHaveAttribute('data-status', 'completed');
    expect(rows[2]).toHaveAttribute('data-status', 'completed');
  });

  it('running step shows running status', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    expect(rows[3]).toHaveAttribute('data-status', 'running');
  });

  it('pending steps show pending status', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    for (const row of rows.slice(4)) {
      expect(row).toHaveAttribute('data-status', 'pending');
    }
  });

  it('failed step shows error icon', () => {
    const steps = buildSteps();
    steps[3] = { ...steps[3], status: 'failed', error: 'Notification service unavailable' };
    setupMock({ data: buildData({ steps, status: 'FAILED' }) });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    expect(rows[3]).toHaveAttribute('data-status', 'failed');
  });

  it('step counter label reads "X / Y completed"', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByTestId('step-counter').textContent).toMatch(/3\s*\/\s*8\s*completed/);
  });

  it('COMPLETED execution shows 100% progress', () => {
    const steps = buildSteps().map<WorkflowMergedStep>((s) => ({ ...s, status: 'completed' }));
    setupMock({
      data: buildData({
        steps,
        status: 'COMPLETED',
        completedCount: 8,
        completedPercent: 100,
        completedAt: '2026-02-17T11:00:00Z',
      }),
    });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('FAILED execution shows failed styling', () => {
    setupMock({ data: buildData({ status: 'FAILED', error: 'Workflow failed' }) });
    const { container } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(container.querySelector('[data-status="FAILED"]')).toBeInTheDocument();
  });

  it('PAUSED execution shows paused visual state', () => {
    setupMock({ data: buildData({ status: 'PAUSED' }) });
    const { container } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(container.querySelector('[data-status="PAUSED"]')).toBeInTheDocument();
  });

  it('CANCELLED execution shows cancelled state', () => {
    setupMock({ data: buildData({ status: 'CANCELLED' }) });
    const { container } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(container.querySelector('[data-status="CANCELLED"]')).toBeInTheDocument();
  });

  it('step labels derived from type via STEP_TYPE_LABELS', () => {
    expect(STEP_TYPE_LABELS.score).toBe('Lead Scoring');
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByText('Lead Scoring')).toBeInTheDocument();
  });
});

// ===========================================================================
// Category 3: Interactions (7 tests)
// ===========================================================================

describe('WorkflowProgressPanel — Category 3: Interactions', () => {
  it('clicking step reveals step detail', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    fireEvent.click(within(rows[0]).getByRole('button'));
    expect(screen.getByTestId('step-detail-1')).toBeInTheDocument();
  });

  it('clicking same step collapses detail (toggle)', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    const toggle = within(rows[0]).getByRole('button');
    fireEvent.click(toggle);
    expect(screen.getByTestId('step-detail-1')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId('step-detail-1')).toBeNull();
  });

  it('clicking step with error shows error message', () => {
    const steps = buildSteps();
    steps[3] = { ...steps[3], status: 'failed', error: 'Notification service unavailable' };
    setupMock({ data: buildData({ steps, status: 'FAILED' }) });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    fireEvent.click(within(rows[3]).getByRole('button'));
    const detail = screen.getByTestId('step-detail-4');
    expect(within(detail).getByText(/Notification service unavailable/i)).toBeInTheDocument();
  });

  it('retry button calls refetch', () => {
    const mock = setupMock({ data: null, error: new Error('network failed') });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(mock.refetch).toHaveBeenCalledTimes(1);
  });

  it('completed step detail shows result data', () => {
    const steps = buildSteps();
    steps[0] = { ...steps[0], result: { score: 85 } };
    setupMock({ data: buildData({ steps }) });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    fireEvent.click(within(rows[0]).getByRole('button'));
    const detail = screen.getByTestId('step-detail-1');
    expect(detail.textContent).toContain('score');
  });

  it('pending step detail shows "not yet started"', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    fireEvent.click(within(rows[4]).getByRole('button'));
    const detail = screen.getByTestId('step-detail-5');
    expect(within(detail).getByText(/not yet started/i)).toBeInTheDocument();
  });

  it('step detail shows duration when available', () => {
    const steps = buildSteps();
    steps[0] = {
      ...steps[0],
      startedAt: '2026-02-17T10:00:00Z',
      completedAt: '2026-02-17T10:00:03Z',
    };
    setupMock({ data: buildData({ steps }) });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    fireEvent.click(within(rows[0]).getByRole('button'));
    const detail = screen.getByTestId('step-detail-1');
    expect(detail.textContent).toMatch(/\d+\s*(ms|s|m)/i);
  });

  it('step detail shows minute-formatted duration for long-running steps', () => {
    const steps = buildSteps();
    steps[0] = {
      ...steps[0],
      startedAt: '2026-02-17T10:00:00Z',
      completedAt: '2026-02-17T10:05:00Z', // 5 minutes
    };
    setupMock({ data: buildData({ steps }) });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    fireEvent.click(within(rows[0]).getByRole('button'));
    const detail = screen.getByTestId('step-detail-1');
    expect(detail.textContent).toMatch(/5m/);
  });

  it('step detail shows millisecond duration for sub-second steps', () => {
    const steps = buildSteps();
    steps[0] = {
      ...steps[0],
      startedAt: '2026-02-17T10:00:00.000Z',
      completedAt: '2026-02-17T10:00:00.500Z', // 500ms
    };
    setupMock({ data: buildData({ steps }) });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    fireEvent.click(within(rows[0]).getByRole('button'));
    const detail = screen.getByTestId('step-detail-1');
    expect(detail.textContent).toMatch(/500ms/);
  });
});

// ===========================================================================
// Category 4: Edge Cases (8 tests)
// ===========================================================================

describe('WorkflowProgressPanel — Category 4: Edge Cases', () => {
  it('0 steps shows empty state', () => {
    setupMock({
      data: buildData({ steps: [], totalSteps: 0, completedCount: 0, completedPercent: 0 }),
    });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.queryAllByTestId('workflow-step')).toHaveLength(0);
    expect(screen.getByTestId('no-steps-empty')).toBeInTheDocument();
  });

  it('all steps completed renders 100% progress', () => {
    const steps = buildSteps().map<WorkflowMergedStep>((s) => ({ ...s, status: 'completed' }));
    setupMock({
      data: buildData({ steps, status: 'COMPLETED', completedCount: 8, completedPercent: 100 }),
    });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('all steps failed renders 0% completed', () => {
    const steps = buildSteps().map<WorkflowMergedStep>((s) => ({ ...s, status: 'failed' }));
    setupMock({
      data: buildData({ steps, status: 'FAILED', completedCount: 0, completedPercent: 0 }),
    });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('step-counter').textContent).toContain('0 / 8');
  });

  it('mixed statuses count only completed for %', () => {
    const steps = buildSteps();
    steps[0] = { ...steps[0], status: 'completed' };
    steps[1] = { ...steps[1], status: 'failed' };
    steps[2] = { ...steps[2], status: 'skipped' };
    steps[3] = { ...steps[3], status: 'running' };
    // Only 1 completed out of 8 = 13%
    setupMock({ data: buildData({ steps, completedCount: 1, completedPercent: 13 }) });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '13');
  });

  it('null/empty stepResults renders all pending', () => {
    const steps = buildSteps().map<WorkflowMergedStep>((s) => ({ ...s, status: 'pending' }));
    setupMock({
      data: buildData({ steps, currentStep: 0, completedCount: 0, completedPercent: 0 }),
    });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const rows = screen.getAllByTestId('workflow-step');
    for (const row of rows) {
      expect(row).toHaveAttribute('data-status', 'pending');
    }
  });

  it('single step workflow renders correctly', () => {
    const steps: WorkflowMergedStep[] = [
      { stepNumber: 1, stepId: 1, name: 'Lead Scoring', type: 'score', status: 'completed' },
    ];
    setupMock({
      data: buildData({ steps, totalSteps: 1, completedCount: 1, completedPercent: 100 }),
    });
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getAllByTestId('workflow-step')).toHaveLength(1);
    expect(screen.getByTestId('step-counter').textContent).toContain('1 / 1');
  });

  it('long step labels truncate', () => {
    const steps = buildSteps();
    steps[0] = {
      ...steps[0],
      name: 'A Very Long Label That Should Be Truncated For Visual Clarity In The Progress Panel UI',
    };
    setupMock({ data: buildData({ steps }) });
    const { container } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(container.querySelector('.truncate')).toBeInTheDocument();
  });

  it('rerender with new data updates progress', () => {
    const { rerender } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38');

    const steps = buildSteps().map<WorkflowMergedStep>((s, i) =>
      i < 5 ? { ...s, status: 'completed' } : s
    );
    setupMock({
      data: buildData({ steps, currentStep: 5, completedCount: 5, completedPercent: 63 }),
    });
    rerender(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  });
});

// ===========================================================================
// Category 5: Accessibility (5 tests)
// ===========================================================================

describe('WorkflowProgressPanel — Category 5: Accessibility', () => {
  it('progress bar has role="progressbar" with aria-valuemin/max/now', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '38');
  });

  it('progress bar has accessible label', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    const bar = screen.getByRole('progressbar');
    const label = bar.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);
    expect(label).toMatch(/progress/i);
  });

  it('status icons have aria-label', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getAllByLabelText(/completed step/i).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/running step/i).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/pending step/i).length).toBeGreaterThan(0);
  });

  it('live region announces progress', () => {
    const { container } = render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('step list uses list semantics', () => {
    render(<WorkflowProgressPanel executionId="exec-1" />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Category 6: Utility Functions (5 tests)
// ===========================================================================

describe('WorkflowProgressPanel — Category 6: Utility Functions', () => {
  it('computeProgressPercent(0, 8) returns 0', () => {
    expect(computeProgressPercent(0, 8)).toBe(0);
  });

  it('computeProgressPercent(8, 8) returns 100', () => {
    expect(computeProgressPercent(8, 8)).toBe(100);
  });

  it('computeProgressPercent(1, 3) returns 33', () => {
    expect(computeProgressPercent(1, 3)).toBe(33);
  });

  it('computeProgressPercent(0, 0) returns 0 (divide-by-zero guard)', () => {
    expect(computeProgressPercent(0, 0)).toBe(0);
    expect(computeProgressPercent(5, 0)).toBe(0);
  });

  it('mapStepStatus unknown returns pending', () => {
    expect(mapStepStatus('UNKNOWN')).toBe('pending');
    expect(mapStepStatus(undefined)).toBe('pending');
    expect(mapStepStatus('completed')).toBe('completed');
    expect(mapStepStatus('RUNNING')).toBe('running');
  });
});
