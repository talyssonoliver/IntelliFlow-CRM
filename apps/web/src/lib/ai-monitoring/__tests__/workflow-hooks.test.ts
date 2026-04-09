/**
 * useWorkflowProgress hook tests — PG-193
 *
 * Verifies that the hook selects between getExecution / getExecutionsByEntity
 * based on its arguments, maps the raw tRPC response into a
 * WorkflowProgressData value, returns null when no arguments are provided,
 * and applies the correct polling interval for terminal vs active states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: {
    workflow: {
      getExecution: { useQuery: vi.fn() },
      getExecutionsByEntity: { useQuery: vi.fn() },
    },
  },
}));

import { api } from '@/lib/api';
import { useWorkflowProgress } from '../workflow-hooks';

const mockGetExecution = api.workflow.getExecution.useQuery as ReturnType<typeof vi.fn>;
const mockGetByEntity = api.workflow.getExecutionsByEntity.useQuery as ReturnType<typeof vi.fn>;

interface QueryStub {
  data: unknown;
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
}

function stubQuery(overrides: Partial<QueryStub> = {}): QueryStub {
  return {
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

const sampleExecution = {
  id: 'exec-1',
  workflowName: 'Lead Qualification',
  status: 'RUNNING',
  currentStep: 2,
  totalSteps: 4,
  completedCount: 2,
  percentage: 50,
  startedAt: '2026-02-17T10:00:00Z',
  completedAt: null,
  error: null,
  steps: [
    { stepNumber: 1, stepId: 1, name: 'Lead Scoring', type: 'score', status: 'completed' },
    { stepNumber: 2, stepId: 2, name: 'Condition Check', type: 'condition', status: 'completed' },
    { stepNumber: 3, stepId: 3, name: 'Assignment', type: 'assign', status: 'running' },
    { stepNumber: 4, stepId: 4, name: 'Send Notification', type: 'notify', status: 'pending' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetExecution.mockReturnValue(stubQuery());
  mockGetByEntity.mockReturnValue(stubQuery());
});

describe('useWorkflowProgress — argument routing', () => {
  it('returns null data when neither executionId nor entity pair is provided', () => {
    const result = useWorkflowProgress({});
    expect(result.data).toBeNull();
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeNull();
    // Noop refetch must be safely callable without throwing
    expect(() => result.refetch()).not.toThrow();
    expect(mockGetExecution).toHaveBeenCalled();
    expect(mockGetByEntity).toHaveBeenCalled();
  });

  it('treats entityType without entityId as "no args" (returns null)', () => {
    const result = useWorkflowProgress({ entityType: 'lead' });
    expect(result.data).toBeNull();
    const entityCall = mockGetByEntity.mock.calls.at(-1);
    expect(entityCall?.[1]?.enabled).toBe(false);
  });

  it('delegates to getExecution when executionId is provided', () => {
    mockGetExecution.mockReturnValue(stubQuery({ data: sampleExecution }));
    const result = useWorkflowProgress({ executionId: 'exec-1' });
    expect(result.data?.executionId).toBe('exec-1');
    expect(result.data?.workflowName).toBe('Lead Qualification');

    // Both queries are always constructed, but getExecution is the "active" one.
    const firstCall = mockGetExecution.mock.calls.at(-1);
    expect(firstCall?.[0]).toEqual({ executionId: 'exec-1' });
    expect(firstCall?.[1]?.enabled).toBe(true);
  });

  it('delegates to getExecutionsByEntity when only entityType+entityId is provided', () => {
    mockGetByEntity.mockReturnValue(stubQuery({ data: sampleExecution }));
    const result = useWorkflowProgress({ entityType: 'lead', entityId: 'lead-1' });
    expect(result.data?.workflowName).toBe('Lead Qualification');

    const entityCall = mockGetByEntity.mock.calls.at(-1);
    expect(entityCall?.[0]).toEqual({ entityType: 'lead', entityId: 'lead-1' });
    expect(entityCall?.[1]?.enabled).toBe(true);

    const execCall = mockGetExecution.mock.calls.at(-1);
    expect(execCall?.[1]?.enabled).toBe(false);
  });

  it('honours the enabled=false flag for both queries', () => {
    useWorkflowProgress({ executionId: 'exec-1', enabled: false });
    const execCall = mockGetExecution.mock.calls.at(-1);
    expect(execCall?.[1]?.enabled).toBe(false);
  });
});

describe('useWorkflowProgress — data mapping', () => {
  it('produces computedPercent derived from completedCount/totalSteps', () => {
    mockGetExecution.mockReturnValue(stubQuery({ data: sampleExecution }));
    const result = useWorkflowProgress({ executionId: 'exec-1' });
    expect(result.data?.completedPercent).toBe(50);
  });

  it('maps unknown raw step statuses to pending', () => {
    const weird = {
      ...sampleExecution,
      steps: [
        { stepNumber: 1, stepId: 1, name: 'Lead Scoring', type: 'score', status: 'garbage' },
      ],
      completedCount: 0,
      totalSteps: 1,
    };
    mockGetExecution.mockReturnValue(stubQuery({ data: weird }));
    const result = useWorkflowProgress({ executionId: 'exec-1' });
    expect(result.data?.steps[0].status).toBe('pending');
  });

  it('returns null data when backend returns null', () => {
    mockGetExecution.mockReturnValue(stubQuery({ data: null }));
    const result = useWorkflowProgress({ executionId: 'exec-1' });
    expect(result.data).toBeNull();
  });

  it('propagates isLoading and error from the active query', () => {
    const err = new Error('boom');
    mockGetExecution.mockReturnValue(stubQuery({ isLoading: true, error: err }));
    const result = useWorkflowProgress({ executionId: 'exec-1' });
    expect(result.isLoading).toBe(true);
    expect(result.error).toBe(err);
  });

  it('refetch calls the active query refetch', () => {
    const refetch = vi.fn();
    mockGetExecution.mockReturnValue(stubQuery({ data: sampleExecution, refetch }));
    const result = useWorkflowProgress({ executionId: 'exec-1' });
    result.refetch();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('useWorkflowProgress — polling strategy', () => {
  function getRefetchInterval(): (query: unknown) => number | false {
    const lastCall = mockGetExecution.mock.calls.at(-1);
    return lastCall?.[1]?.refetchInterval as (query: unknown) => number | false;
  }

  it('polls every 5s when data is missing', () => {
    useWorkflowProgress({ executionId: 'exec-1' });
    const interval = getRefetchInterval();
    expect(interval({ state: { data: undefined } })).toBe(5000);
  });

  it('polls every 5s when status is RUNNING', () => {
    useWorkflowProgress({ executionId: 'exec-1' });
    const interval = getRefetchInterval();
    expect(interval({ state: { data: { status: 'RUNNING' } } })).toBe(5000);
  });

  it('polls every 5s when status is PAUSED', () => {
    useWorkflowProgress({ executionId: 'exec-1' });
    const interval = getRefetchInterval();
    expect(interval({ state: { data: { status: 'PAUSED' } } })).toBe(5000);
  });

  it('stops polling when status is COMPLETED', () => {
    useWorkflowProgress({ executionId: 'exec-1' });
    const interval = getRefetchInterval();
    expect(interval({ state: { data: { status: 'COMPLETED' } } })).toBe(false);
  });

  it('stops polling when status is FAILED or CANCELLED', () => {
    useWorkflowProgress({ executionId: 'exec-1' });
    const interval = getRefetchInterval();
    expect(interval({ state: { data: { status: 'FAILED' } } })).toBe(false);
    expect(interval({ state: { data: { status: 'CANCELLED' } } })).toBe(false);
  });

  it('entity query also has working refetchInterval callback', () => {
    useWorkflowProgress({ entityType: 'lead', entityId: 'lead-1' });
    const lastCall = mockGetByEntity.mock.calls.at(-1);
    const interval = lastCall?.[1]?.refetchInterval as (q: unknown) => number | false;
    expect(interval({ state: { data: { status: 'RUNNING' } } })).toBe(5000);
    expect(interval({ state: { data: { status: 'COMPLETED' } } })).toBe(false);
    expect(interval({ state: { data: undefined } })).toBe(5000);
  });
});
