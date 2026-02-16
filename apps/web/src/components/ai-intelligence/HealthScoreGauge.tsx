'use client';

/**
 * HealthScoreGauge — Semicircular gauge for engagement/health score (PG-143)
 */

import { Card, CardContent, CardHeader, CardTitle, cn } from '@intelliflow/ui';

interface HealthScoreGaugeProps {
  score: number;
  label?: string;
}

function getScoreColor(score: number): string {
  if (score < 30) return 'text-red-600 dark:text-red-400';
  if (score < 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getArcColor(score: number): string {
  if (score < 30) return '#ef4444';
  if (score < 60) return '#f59e0b';
  return '#22c55e';
}

export function HealthScoreGauge({ score, label = 'Health Score' }: HealthScoreGaugeProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  // Semicircle arc: 180 degrees, radius 60, center (80, 70)
  const radius = 60;
  const cx = 80;
  const cy = 70;
  const angleRange = Math.PI; // 180 degrees
  const angle = (clampedScore / 100) * angleRange;

  // Start at left (180 deg), sweep clockwise
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
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center pb-4">
        <div
          role="meter"
          aria-valuenow={clampedScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${clampedScore} out of 100`}
          className="relative"
        >
          <svg width="160" height="90" viewBox="0 0 160 90" aria-hidden="true">
            {/* Background arc */}
            <path
              d={bgPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              className="text-muted/20"
            />
            {/* Score arc */}
            {clampedScore > 0 && (
              <path
                d={arcPath}
                fill="none"
                stroke={getArcColor(clampedScore)}
                strokeWidth="12"
                strokeLinecap="round"
              />
            )}
          </svg>
          {/* Center score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-0">
            <span
              className={cn('text-3xl font-bold', getScoreColor(clampedScore))}
              data-testid="health-score-value"
            >
              {clampedScore}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">out of 100</p>
      </CardContent>
    </Card>
  );
}
