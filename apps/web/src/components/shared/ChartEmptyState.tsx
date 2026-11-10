/**
 * ChartEmptyState — the message a chart shows in its plot area when
 * `isEmptySeries` says there is nothing to draw (#1225 UI-013).
 *
 * It fills the space the chart would take, so the card keeps its size.
 */

import { cn } from '@intelliflow/ui';
import { EMPTY_CHART_MESSAGE } from '@/lib/charts/empty-series';

export interface ChartEmptyStateProps {
  message?: string;
  /** Height when the parent gives none, e.g. `h-48`. */
  className?: string;
}

export function ChartEmptyState({
  message = EMPTY_CHART_MESSAGE,
  className,
}: Readonly<ChartEmptyStateProps>) {
  return (
    <output
      data-testid="chart-empty"
      className={cn(
        'flex h-full min-h-[8rem] w-full flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground',
        className
      )}
    >
      <span className="material-symbols-outlined text-2xl" aria-hidden="true">
        bar_chart
      </span>
      <span>{message}</span>
    </output>
  );
}

export interface ChartUnavailableProps {
  /** What failed, e.g. "Couldn't load growth trends." */
  message: string;
  onRetry: () => void;
  className?: string;
  testId?: string;
}

/**
 * ChartUnavailable — shown in the plot area when the chart's request failed.
 * A failed request is not an empty period, so it never reuses ChartEmptyState.
 */
export function ChartUnavailable({
  message,
  onRetry,
  className,
  testId = 'chart-error',
}: Readonly<ChartUnavailableProps>) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn(
        'flex h-full min-h-[8rem] w-full flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground',
        className
      )}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-border px-3 py-1 text-sm text-foreground hover:bg-muted"
      >
        Retry
      </button>
    </div>
  );
}
