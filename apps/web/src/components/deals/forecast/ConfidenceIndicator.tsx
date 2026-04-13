'use client';

/**
 * ConfidenceIndicator (PG-131)
 *
 * Displays composite confidence score with color coding.
 * AC-007: Score display, color thresholds, timestamp, description toggle.
 *
 * Note: packages/ui ConfidenceIndicator exists but lacks lastUpdatedAt prop
 * and deal-specific color thresholds. This is a forecast-specific variant.
 */

export interface ConfidenceIndicatorProps {
  confidence: number;
  lastUpdatedAt?: string;
  showDescription?: boolean;
  size?: 'sm' | 'md';
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
  if (confidence >= 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ConfidenceIndicator({
  confidence,
  lastUpdatedAt,
  showDescription = false,
  size = 'md',
}: Readonly<ConfidenceIndicatorProps>) {
  const clamped = Math.max(0, Math.min(1, confidence));
  const percentage = Math.round(clamped * 100);
  const colorClass = getConfidenceColor(clamped);
  const label = getConfidenceLabel(clamped);

  return (
    <span
      className={`inline-flex flex-col ${size === 'sm' ? 'gap-0.5' : 'gap-1'}`}
      data-testid="confidence-indicator"
      role="meter"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Data confidence"
    >
      <span className="flex items-center gap-2">
        <span
          className={`font-semibold ${size === 'sm' ? 'text-sm' : 'text-base'} ${colorClass}`}
          data-testid="confidence-value"
        >
          {percentage}%
        </span>
        <span className={`text-xs ${colorClass}`} data-testid="confidence-label">
          {label} confidence
        </span>
      </span>
      {lastUpdatedAt && (
        <span className="text-xs text-muted-foreground" data-testid="last-updated">
          Updated {formatRelativeTime(lastUpdatedAt)}
        </span>
      )}
      {showDescription && (
        <span className="text-xs text-muted-foreground block" data-testid="confidence-description">
          Based on activity frequency, manual probability updates, contact engagement, and close
          date presence.
        </span>
      )}
    </span>
  );
}
