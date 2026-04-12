'use client';

interface TrendSparklineProps {
  data: Array<{ date: string; value: number }>;
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
  label?: string;
}

interface SparklinePoint {
  x: number;
  y: number;
}

/**
 * Calculate SVG coordinates from data array.
 * Exported for testability in Node environment (no jsdom).
 */
export function calculateSparklinePoints(
  data: Array<{ date: string; value: number }>,
  width: number,
  height: number
): SparklinePoint[] {
  if (!data || data.length === 0) return [];

  if (data.length === 1) {
    return [{ x: width / 2, y: height / 2 }];
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((d.value - min) / range) * height,
  }));
}

export default function TrendSparkline({
  data,
  width = 200,
  height = 40,
  color = '#3b82f6',
  showDots = true,
  label,
}: Readonly<TrendSparklineProps>) {
  if (!data || data.length === 0) return null;

  if (data.length < 2) {
    return <span className="text-xs text-gray-400 italic">No trend data yet</span>;
  }

  const points = calculateSparklinePoints(data, width, height);
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img" // NOSONAR typescript:S6819 — inline SVG sparkline chart; <img> cannot render dynamic SVG polylines
      aria-label={label ?? 'Trend sparkline'}
      className="inline-block"
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots along the sparkline — key is positional (stable render order) */}
      {showDots &&
        points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} /> // NOSONAR typescript:S6479
        ))}
    </svg>
  );
}
