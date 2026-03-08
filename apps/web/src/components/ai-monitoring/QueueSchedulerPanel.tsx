'use client';

/**
 * Queue Scheduler Panel — IFC-296
 *
 * Displays BullMQ queue status with pause/resume/retry controls.
 * Shows scheduler entries (cron patterns) per queue.
 * Data-in/callbacks-out pattern (like CostTracker).
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@intelliflow/ui';
import type {
  QueueSchedulerPanelProps,
  QueueSchedulerData,
  SchedulerQueueName,
} from '@/lib/ai-monitoring/types';

// ---------------------------------------------------------------------------
// Status badge colors (matching ActiveAgentsDashboard patterns)
// ---------------------------------------------------------------------------

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
} as const;

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      {/* NOSONAR typescript:S6479 */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" /> // NOSONAR typescript:S6479
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue row
// ---------------------------------------------------------------------------

function QueueRow({
  queue,
  isPending,
  onPause,
  onResume,
  onRetryFailed,
  onDeleteScheduler,
}: {
  queue: QueueSchedulerData['queues'][number];
  isPending: boolean;
  onPause: (name: SchedulerQueueName) => void;
  onResume: (name: SchedulerQueueName) => void;
  onRetryFailed: (name: SchedulerQueueName) => void;
  onDeleteScheduler: (name: SchedulerQueueName, schedulerId: string) => void;
}) {
  const statusLabel = queue.isPaused ? 'Paused' : 'Active';
  const statusKey = queue.isPaused ? 'paused' : 'active';

  return (
    <div
      className="p-3 rounded-lg border hover:bg-muted/50 transition-colors"
      data-testid={`queue-row-${queue.name}`}
    >
      {/* Header: name + status badge + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{queue.name}</span>
          <Badge
            className={cn('text-xs', STATUS_COLORS[statusKey])}
            aria-label={`${queue.name} ${statusLabel.toLowerCase()}`}
          >
            {statusLabel}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          {queue.isPaused ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => onResume(queue.name)}
              data-testid={`action-resume-${queue.name}`}
              aria-label={`Resume ${queue.name} queue`}
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">play_arrow</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => onPause(queue.name)}
              data-testid={`action-pause-${queue.name}`}
              aria-label={`Pause ${queue.name} queue`}
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">pause</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => onRetryFailed(queue.name)}
            aria-label={`Retry failed jobs in ${queue.name}`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">replay</span>
          </Button>
        </div>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <span>Waiting: <strong className="text-foreground">{queue.counts.waiting}</strong></span>
        <span>Active: <strong className="text-foreground">{queue.counts.active}</strong></span>
        <span>Completed: <strong className="text-foreground">{queue.counts.completed}</strong></span>
        <span>Failed: <strong className="text-foreground">{queue.counts.failed}</strong></span>
        <span>Delayed: <strong className="text-foreground">{queue.counts.delayed}</strong></span>
      </div>

      {/* Schedulers */}
      {queue.schedulers.length > 0 && (
        <div className="mt-2 space-y-1">
          {queue.schedulers.map((sched) => (
            <div key={sched.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">schedule</span>
                <span className="font-mono">{sched.pattern ?? 'interval'}</span>
                <span>{sched.name}</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => onDeleteScheduler(queue.name, sched.id)}
                      aria-label={`Delete scheduler ${sched.id}`}
                    >
                      <span className="material-symbols-outlined text-sm text-destructive" aria-hidden="true">delete</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Deletion is temporary — scheduler will re-register on worker restart
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QueueSchedulerPanel({
  data,
  isLoading,
  isUnavailable,
  isPending,
  onPause,
  onResume,
  onRetryFailed,
  onDeleteScheduler,
  onRefresh,
}: Readonly<QueueSchedulerPanelProps>) {
  return (
    <Card data-testid="queue-scheduler-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">queue</span>
            Queue Scheduler
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            aria-label="Refresh queue data"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <PanelSkeleton />
        ) : isUnavailable ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Queue monitoring unavailable
          </p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No queue data available
          </p>
        ) : (
          <div className="space-y-2">
            {data.queues.map((queue) => (
              <QueueRow
                key={queue.name}
                queue={queue}
                isPending={isPending[queue.name] ?? false}
                onPause={onPause}
                onResume={onResume}
                onRetryFailed={onRetryFailed}
                onDeleteScheduler={onDeleteScheduler}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
