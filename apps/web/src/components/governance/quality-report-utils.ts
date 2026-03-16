/**
 * Shared utilities for quality report sub-pages.
 * Extracts common score color logic to avoid duplication across
 * LighthouseReportView, CoverageReportView, and PerformanceReportView.
 */

/**
 * Returns a Tailwind text color class based on score thresholds.
 * Matches the established pattern from QualityReportDetailClient.tsx:184-188.
 *
 * - score >= 90 → emerald-500 (passing)
 * - score >= 70 → amber-500 (warning)
 * - score < 70  → red-500 (failing)
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-500';
  if (score >= 70) return 'text-amber-500';
  return 'text-red-500';
}

/**
 * Returns a Tailwind background color class for score badges.
 */
export function getScoreBgColor(score: number): string {
  if (score >= 90) return 'bg-emerald-100 dark:bg-emerald-900/30';
  if (score >= 70) return 'bg-amber-100 dark:bg-amber-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

/**
 * Returns a Tailwind progress bar color class.
 */
export function getProgressColor(score: number): string {
  if (score >= 90) return '[&>div]:bg-emerald-500';
  if (score >= 70) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

/**
 * Parses a duration string like "12.5ms" to a number (12.5).
 * Returns null if parsing fails or value is "N/A".
 */
export function parseDurationMs(value: string): number | null {
  if (!value || value === 'N/A') return null;
  const match = value.match(/^([\d.]+)\s*ms$/i);
  return match ? parseFloat(match[1]) : null;
}
