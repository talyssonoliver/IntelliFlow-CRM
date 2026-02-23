'use client';

/**
 * ProbabilityGauge (PG-131)
 *
 * SVG circular gauge for win probability or forecast accuracy.
 * AC-003: Correct percentage, color thresholds, optional target line.
 */

const SIZE_MAP = { sm: 48, md: 80, lg: 120 } as const;
const STROKE_WIDTH_MAP = { sm: 4, md: 6, lg: 8 } as const;

export interface ProbabilityGaugeProps {
  value: number;
  label: string;
  target?: number;
  isAtRisk?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function getGaugeColor(value: number, isAtRisk?: boolean): string {
  if (isAtRisk) return 'text-red-500';
  if (value >= 70) return 'text-green-500';
  if (value >= 50) return 'text-amber-500';
  return 'text-red-500';
}

export function ProbabilityGauge({
  value,
  label,
  target,
  isAtRisk,
  size = 'md',
  showLabel = true,
}: ProbabilityGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const dimension = SIZE_MAP[size];
  const strokeWidth = STROKE_WIDTH_MAP[size];
  const radius = (dimension - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;
  const colorClass = getGaugeColor(clamped, isAtRisk);

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid="probability-gauge"
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg
        width={dimension}
        height={dimension}
        viewBox={`0 0 ${dimension} ${dimension}`}
        className={colorClass}
      >
        {/* Background circle */}
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="opacity-20"
        />
        {/* Progress arc */}
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${dimension / 2} ${dimension / 2})`}
          data-testid="gauge-arc"
        />
        {/* Target line */}
        {target !== undefined && (
          <line
            x1={dimension / 2}
            y1={strokeWidth / 2}
            x2={dimension / 2}
            y2={strokeWidth / 2 + strokeWidth}
            stroke="currentColor"
            strokeWidth={2}
            className="opacity-50"
            transform={`rotate(${(target / 100) * 360 - 90} ${dimension / 2} ${dimension / 2})`}
            data-testid="target-line"
          />
        )}
        {/* Center text */}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground"
          fontSize={dimension * 0.25}
          fontWeight="bold"
        >
          {clamped}%
        </text>
      </svg>
      {showLabel && (
        <span className="text-xs text-muted-foreground" data-testid="gauge-label">
          {label}
        </span>
      )}
    </div>
  );
}
