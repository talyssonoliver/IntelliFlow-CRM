'use client';

/**
 * ErrorRateGauge — SVG semicircle gauge for error rate drift (PG-146)
 * Pattern: apps/web/src/components/ai-intelligence/HealthScoreGauge.tsx
 */

import { Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from '@intelliflow/ui';
import type { DriftHistoryItem } from '@/lib/ai-monitoring/types';
import { formatDriftScore } from '@/lib/ai-monitoring/drift-utils';

interface ErrorRateGaugeProps {
  driftResult: DriftHistoryItem | null;
  isLoading: boolean;
}

function getGaugeColor(score: number): string {
  if (score < 0.1) return '#22c55e';
  if (score < 0.5) return '#f59e0b';
  return '#ef4444';
}

function getScoreTextColor(score: number): string {
  if (score < 0.1) return 'text-green-600 dark:text-green-400';
  if (score < 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function ErrorRateGauge({ driftResult, isLoading }: ErrorRateGaugeProps) {
  const score = driftResult?.driftScore ?? 0;
  const clampedScore = Math.min(1, Math.max(0, score));

  // Semicircle arc: 180 degrees, radius 60, center (80, 70)
  const radius = 60;
  const cx = 80;
  const cy = 70;
  const angleRange = Math.PI;
  const angle = clampedScore * angleRange;

  const startX = cx - radius;
  const startY = cy;
  const endX = cx - radius * Math.cos(angle);
  const endY = cy - radius * Math.sin(angle);
  const largeArcFlag = angle > Math.PI / 2 ? 1 : 0;

  const arcPath = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
  const bgPath = `M ${startX} ${startY} A ${radius} ${radius} 0 1 1 ${cx + radius} ${startY}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Error Rate Drift</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center pb-4">
        {isLoading ? (
          <Skeleton className="h-24 w-40" />
        ) : (
          <>
            <div
              role="meter"
              aria-valuenow={clampedScore}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-label={`Error rate drift gauge: ${formatDriftScore(clampedScore)}`}
              className="relative"
            >
              <svg width="160" height="90" viewBox="0 0 160 90" aria-hidden="true">
                <path
                  d={bgPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="round"
                  className="text-muted/20"
                />
                {clampedScore > 0 && (
                  <path
                    d={arcPath}
                    fill="none"
                    stroke={getGaugeColor(clampedScore)}
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-0">
                <span
                  className={cn('text-2xl font-bold', getScoreTextColor(clampedScore))}
                  data-testid="gauge-score"
                >
                  {formatDriftScore(clampedScore)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {driftResult ? driftResult.metric : 'No data'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
