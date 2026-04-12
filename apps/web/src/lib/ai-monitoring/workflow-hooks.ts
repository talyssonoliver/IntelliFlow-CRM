'use client';

/**
 * Workflow Progress Hook — PG-193
 *
 * Wraps the `workflow.getExecution` and `workflow.getExecutionsByEntity`
 * tRPC procedures and returns a typed `WorkflowProgressData` value ready
 * for consumption by `<WorkflowProgressPanel>`.
 *
 * Polling strategy: 5s interval for RUNNING/PAUSED executions; no polling
 * once the execution reaches a terminal state (COMPLETED/FAILED/CANCELLED).
 */

import { api } from '@/lib/api';
import {
  computeProgressPercent,
  type WorkflowExecutionStatus,
  type WorkflowMergedStep,
  type WorkflowProgressData,
  type WorkflowStepStatus,
} from './workflow-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATES: ReadonlySet<WorkflowExecutionStatus> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseWorkflowProgressParams {
  executionId?: string;
  entityType?: string | null;
  entityId?: string | null;
  enabled?: boolean;
}

export interface UseWorkflowProgressResult {
  data: WorkflowProgressData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface RawExecutionStep {
  stepNumber: number;
  stepId: number;
  name: string;
  type: string;
  status: string;
  result?: Record<string, unknown> | null;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface RawExecution {
  id: string;
  workflowName: string;
  status: WorkflowExecutionStatus;
  currentStep: number;
  totalSteps: number;
  completedCount: number;
  percentage: number;
  steps: RawExecutionStep[];
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

// The backend (workflow.router.ts `mergeSteps`) already emits canonical
// lowercase step statuses, so we trust the API contract here and cast
// directly. Frontend-side normalisation of unknown values is still available
// via `mapStepStatus` in workflow-types.ts if the contract ever loosens.
function toMergedStep(step: RawExecutionStep): WorkflowMergedStep {
  return {
    stepNumber: step.stepNumber,
    stepId: step.stepId,
    name: step.name,
    type: step.type,
    status: step.status as WorkflowStepStatus,
    result: step.result ?? null,
    error: step.error,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
  };
}

function toProgressData(raw: RawExecution | null | undefined): WorkflowProgressData | null {
  if (!raw) return null;
  const steps = raw.steps.map(toMergedStep);
  return {
    executionId: raw.id,
    workflowName: raw.workflowName,
    status: raw.status,
    currentStep: raw.currentStep,
    totalSteps: raw.totalSteps,
    completedCount: raw.completedCount,
    completedPercent: computeProgressPercent(raw.completedCount, raw.totalSteps),
    steps,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    error: raw.error,
  };
}

function pollIntervalFor(status: WorkflowExecutionStatus | undefined): number | false {
  if (!status) return POLL_INTERVAL_MS;
  return TERMINAL_STATES.has(status) ? false : POLL_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkflowProgress(params: UseWorkflowProgressParams): UseWorkflowProgressResult {
  const enabled = params.enabled ?? true;
  const hasExecutionId = Boolean(params.executionId);
  const hasEntityPair = Boolean(params.entityType && params.entityId);

  const executionQuery = api.workflow.getExecution.useQuery(
    { executionId: params.executionId ?? '' },
    {
      enabled: enabled && hasExecutionId,
      staleTime: POLL_INTERVAL_MS,
      refetchInterval: (query) => {
        const d = query.state.data as RawExecution | null | undefined;
        return pollIntervalFor(d?.status);
      },
    }
  );

  const entityQuery = api.workflow.getExecutionsByEntity.useQuery(
    {
      entityType: params.entityType ?? '',
      entityId: params.entityId ?? '',
    },
    {
      enabled: enabled && !hasExecutionId && hasEntityPair,
      staleTime: POLL_INTERVAL_MS,
      refetchInterval: (query) => {
        const d = query.state.data as RawExecution | null | undefined;
        return pollIntervalFor(d?.status);
      },
    }
  );

  if (!hasExecutionId && !hasEntityPair) {
    return { data: null, isLoading: false, error: null, refetch: () => {} };
  }

  const activeQuery = hasExecutionId ? executionQuery : entityQuery;
  const raw = activeQuery.data as RawExecution | null | undefined;

  return {
    data: toProgressData(raw ?? null),
    isLoading: activeQuery.isLoading,
    error: (activeQuery.error as Error | null) ?? null,
    refetch: () => {
      activeQuery.refetch();
    },
  };
}
