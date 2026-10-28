'use client';

// Recent runs of one rule — PG-208 (AC-TA-012): status, plain-language outcome
// and a link to the created task, newest first (the router returns the latest 20).

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { RUN_STATUS_LABELS, outcomeLabel, type RuleItem } from '../task-automation-labels';

export interface RecentRunsDialogProps {
  /** Rule whose runs are shown; null closes the dialog. */
  readonly rule: RuleItem | null;
  readonly onClose: () => void;
}

const STATUS_CLASS: Record<string, string> = {
  SUCCEEDED: 'text-emerald-700 dark:text-emerald-400',
  FAILED: 'text-red-700 dark:text-red-300',
  SKIPPED: 'text-amber-700 dark:text-amber-400',
};

function RunsBody({ ruleId }: Readonly<{ ruleId: string }>) {
  const { formatDateTime } = useTimezoneContext();
  const runsQuery = trpc.taskAutomation.listRuns.useQuery({ ruleId });
  if (runsQuery.isLoading) {
    return (
      <output aria-busy="true" className="block">
        <span className="sr-only">Loading recent runs</span>
        <Skeleton className="h-24 w-full" />
      </output>
    );
  }
  if (runsQuery.error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        Failed to load runs. {runsQuery.error.message}
      </p>
    );
  }
  const runs = runsQuery.data ?? [];
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">This rule has not run yet.</p>;
  }
  return (
    <ul className="divide-y divide-border" aria-label="Recent runs">
      {runs.map((run) => (
        <li key={run.id} className="space-y-0.5 py-2 text-sm">
          <p>
            <span className={`font-medium ${STATUS_CLASS[run.status] ?? 'text-foreground'}`}>
              {RUN_STATUS_LABELS[run.status] ?? run.status}
            </span>
            <span className="text-muted-foreground"> · {formatDateTime(run.createdAt)}</span>
          </p>
          {run.outcome && <p className="text-muted-foreground">{outcomeLabel(run.outcome)}</p>}
          {run.taskId && (
            <Link
              href={`/tasks/${run.taskId}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              Open the task
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RecentRunsDialog({ rule, onClose }: RecentRunsDialogProps) {
  return (
    <Dialog open={rule !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recent runs: {rule?.name ?? ''}</DialogTitle>
          <DialogDescription>
            The latest runs, newest first. Runs older than 30 days are removed.
          </DialogDescription>
        </DialogHeader>
        {rule && <RunsBody ruleId={rule.id} />}
      </DialogContent>
    </Dialog>
  );
}
