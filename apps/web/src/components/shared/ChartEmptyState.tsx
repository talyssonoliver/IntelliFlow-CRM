/**
 * ChartEmptyState — what a chart shows in its plot area when `isEmptySeries` says there is
 * nothing to draw (#1225 UI-013).
 *
 * Owner 23/11 on Deal Forecast: "This empty state aren't following our shared ones". It used to
 * draw its own dashed box; it is now the shared illustrated EmptyState (the one the Dashboard's
 * Deals Won, Pipeline and Tasks cards use), so every chart's zero state matches every list's.
 * It still fills the space the chart would take, so the card keeps its size.
 */

import { cn, EmptyState } from '@intelliflow/ui';
import { EMPTY_CHART_MESSAGE } from '@/lib/charts/empty-series';

export interface ChartEmptyStateProps {
  /** The title, e.g. "No revenue in this period yet". */
  message?: string;
  /** One line under the title saying what will show here. */
  description?: string;
  /** Height when the parent gives none, e.g. `h-48`. */
  className?: string;
}

export function ChartEmptyState({
  message = EMPTY_CHART_MESSAGE,
  description = 'This fills in as deals and activity come in.',
  className,
}: Readonly<ChartEmptyStateProps>) {
  return (
    <output
      data-testid="chart-empty"
      className={cn('flex h-full min-h-[8rem] w-full flex-1 flex-col justify-center', className)}
    >
      <EmptyState
        entity="reports"
        showCta={false}
        size="sm"
        title={message}
        description={description}
        className="py-2"
      />
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
