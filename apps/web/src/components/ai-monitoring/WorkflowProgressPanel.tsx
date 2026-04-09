'use client';

/**
 * Workflow Step Progress Panel — PG-193
 *
 * Real-time N/N step progress tracker for WorkflowExecution records.
 * Rendered inside ActiveAgentsDashboard and AgentLogsViewer expanded cards
 * on /agent-approvals/agents and /agent-approvals/logs.
 *
 * Design reference: docs/design/mockups/workflow-progress-panel.png
 */

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  Button,
  Progress,
  Skeleton,
  cn,
} from '@intelliflow/ui';
import { useWorkflowProgress } from '@/lib/ai-monitoring/workflow-hooks';
import type {
  WorkflowExecutionStatus,
  WorkflowMergedStep,
  WorkflowStepStatus,
} from '@/lib/ai-monitoring/workflow-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorkflowProgressPanelProps {
  executionId?: string;
  entityType?: string | null;
  entityId?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Step status visuals
// ---------------------------------------------------------------------------

interface StepVisual {
  icon: string;
  iconClass: string;
  ariaLabel: string;
  ringClass: string;
}

const STEP_VISUALS: Record<WorkflowStepStatus, StepVisual> = {
  completed: {
    icon: 'check',
    iconClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    ariaLabel: 'Completed step',
    ringClass: 'ring-green-300 dark:ring-green-700',
  },
  running: {
    icon: 'progress_activity',
    iconClass:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse',
    ariaLabel: 'Running step',
    ringClass: 'ring-blue-300 dark:ring-blue-700',
  },
  failed: {
    icon: 'error',
    iconClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    ariaLabel: 'Failed step',
    ringClass: 'ring-red-300 dark:ring-red-700',
  },
  skipped: {
    icon: 'skip_next',
    iconClass: 'bg-muted text-muted-foreground',
    ariaLabel: 'Skipped step',
    ringClass: 'ring-muted',
  },
  pending: {
    icon: 'radio_button_unchecked',
    iconClass: 'bg-muted text-muted-foreground',
    ariaLabel: 'Pending step',
    ringClass: 'ring-muted',
  },
};

const STATUS_TONE: Record<WorkflowExecutionStatus, string> = {
  RUNNING: 'text-blue-600 dark:text-blue-400',
  PAUSED: 'text-amber-600 dark:text-amber-400',
  COMPLETED: 'text-green-600 dark:text-green-400',
  FAILED: 'text-red-600 dark:text-red-400',
  CANCELLED: 'text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatDuration(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const diff = Math.max(0, end - start);
  if (diff < 1000) return `${diff}ms`;
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface WorkflowStepItemProps {
  step: WorkflowMergedStep;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function renderStepDetail(step: WorkflowMergedStep) {
  const duration = formatDuration(step.startedAt, step.completedAt);

  if (step.status === 'pending') {
    return (
      <p className="text-xs text-muted-foreground">This step has not yet started.</p>
    );
  }

  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      {duration && <p>Duration: {duration}</p>}
      {step.error && (
        <p className="text-red-600 dark:text-red-400 break-words">{step.error}</p>
      )}
      {step.result && Object.keys(step.result).length > 0 && (
        <pre className="rounded bg-muted/50 p-2 text-[11px] overflow-auto max-h-40">
          {JSON.stringify(step.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function WorkflowStepItem({
  step,
  isLast,
  isExpanded,
  onToggle,
}: Readonly<WorkflowStepItemProps>) {
  const visual = STEP_VISUALS[step.status];

  return (
    <li
      data-testid="workflow-step"
      data-status={step.status}
      className="relative pl-10 pb-4 last:pb-0"
    >
      {/* Step indicator circle */}
      <span
        aria-label={visual.ariaLabel}
        className={cn(
          'absolute left-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-full ring-2',
          visual.iconClass,
          visual.ringClass,
        )}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {visual.icon}
        </span>
      </span>

      {/* Vertical connector line */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[13px] top-7 bottom-0 w-px bg-border"
        />
      )}

      {/* Clickable row */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between gap-2 text-left rounded px-1 py-0.5 hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium truncate">{step.name}</span>
        <span className="text-[11px] uppercase text-muted-foreground shrink-0">
          {step.status}
        </span>
      </button>

      {isExpanded && (
        <div
          data-testid={`step-detail-${step.stepNumber}`}
          className="mt-2 ml-1 border-l pl-3"
        >
          {renderStepDetail(step)}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function WorkflowProgressPanel({
  executionId,
  entityType,
  entityId,
  className,
}: Readonly<WorkflowProgressPanelProps>) {
  const { data, isLoading, error, refetch } = useWorkflowProgress({
    executionId,
    entityType,
    entityId,
  });

  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const toggleStep = useCallback((stepNumber: number) => {
    setExpandedStep((prev) => (prev === stepNumber ? null : stepNumber));
  }, []);

  // Nothing to query — return null (do not render shell)
  if (!executionId && !(entityType && entityId)) {
    return null;
  }

  // Loading — skeleton shell
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-1/2 animate-pulse" />
          <Skeleton className="h-2 w-full animate-pulse" />
          <Skeleton className="h-24 w-full animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Error — retry state
  if (error) {
    return (
      <Card className={className} data-testid="error-message">
        <CardContent className="flex flex-col items-center p-4 text-center">
          <span className="material-symbols-outlined text-2xl text-red-500 mb-1">
            error
          </span>
          <p className="text-sm text-muted-foreground mb-2">
            Failed to load workflow progress
          </p>
          <Button
            data-testid="retry-button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No execution found — render nothing (consumer may show nothing)
  if (!data) {
    return null;
  }

  const { workflowName, status, completedCount, totalSteps, completedPercent, steps } = data;

  return (
    <Card
      className={className}
      data-testid="workflow-progress-panel"
      data-status={status}
    >
      <CardContent className="p-4">
        {/* Header */}
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold truncate">{workflowName}</h4>
            <p
              className={cn(
                'text-[11px] font-medium uppercase tracking-wide',
                STATUS_TONE[status],
              )}
            >
              {status}
            </p>
          </div>
          <span data-testid="step-counter" className="text-xs text-muted-foreground shrink-0">
            {completedCount} / {totalSteps} completed
          </span>
        </header>

        {/* Progress bar */}
        <Progress
          value={completedPercent}
          className="h-1.5 mb-4"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completedPercent}
          aria-label={`Workflow progress: ${completedPercent}% (${completedCount} of ${totalSteps} steps completed)`}
        />

        {/* Live region for SR announcements */}
        <p aria-live="polite" className="sr-only">
          {`${workflowName} — ${completedCount} of ${totalSteps} steps completed (${completedPercent}%)`}
        </p>

        {/* Step list */}
        {steps.length === 0 ? (
          <div
            data-testid="no-steps-empty"
            className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground"
          >
            This workflow has no steps configured.
          </div>
        ) : (
          <ol className="relative mt-1">
            {steps.map((step, idx) => (
              <WorkflowStepItem
                key={`${step.stepNumber}-${step.stepId}`}
                step={step}
                isLast={idx === steps.length - 1}
                isExpanded={expandedStep === step.stepNumber}
                onToggle={() => toggleStep(step.stepNumber)}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
