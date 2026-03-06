/**
 * Experiment Utilities (PG-149)
 *
 * Formatting and computation helpers for the Experiments Dashboard.
 * Provides plain-English interpretations of statistical metrics.
 */

import type { ExperimentSummary, ExperimentStats } from './types';

// =============================================================================
// Statistical Formatting
// =============================================================================

/** Format p-value for display: "< 0.001", "0.023", etc. */
export function formatPValue(pValue: number): string {
  if (pValue < 0.001) return '< 0.001';
  if (pValue < 0.01) return '< 0.01';
  return pValue.toFixed(3);
}

/** Get plain-English significance description */
export function getSignificanceDescription(pValue: number, alpha: number = 0.05): string {
  if (pValue < alpha) {
    if (pValue < 0.001) return 'Highly significant (p < 0.001)';
    if (pValue < 0.01) return 'Very significant (p < 0.01)';
    return `Significant (p < ${alpha})`;
  }
  return 'Not significant';
}

/** Interpret effect size using Cohen's d thresholds */
export function interpretEffectSize(d: number): string {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'NEGLIGIBLE';
  if (absD < 0.5) return 'SMALL';
  if (absD < 0.8) return 'MEDIUM';
  return 'LARGE';
}

/** Format confidence interval for display */
export function formatConfidenceInterval(lower: number, upper: number): string {
  return `[${lower.toFixed(1)}, ${upper.toFixed(1)}]`;
}

// =============================================================================
// Status & Type Helpers
// =============================================================================

/** Get Tailwind color classes for experiment status */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    case 'RUNNING':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'PAUSED':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'COMPLETED':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'ARCHIVED':
      return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

/** Get human-readable experiment type label */
export function getTypeLabel(type: string): string {
  switch (type) {
    case 'AI_VS_MANUAL':
      return 'AI vs Manual';
    case 'MODEL_COMPARISON':
      return 'Model Comparison';
    case 'THRESHOLD_TEST':
      return 'Threshold Test';
    default:
      return type;
  }
}

/** Get available actions for an experiment based on status */
export function getExperimentActions(
  status: string
): { label: string; action: string; icon: string }[] {
  switch (status) {
    case 'DRAFT':
      return [{ label: 'Start', action: 'start', icon: 'play_arrow' }];
    case 'RUNNING':
      return [
        { label: 'Pause', action: 'pause', icon: 'pause' },
        { label: 'Complete', action: 'complete', icon: 'check_circle' },
      ];
    case 'PAUSED':
      return [
        { label: 'Resume', action: 'start', icon: 'play_arrow' },
        { label: 'Complete', action: 'complete', icon: 'check_circle' },
      ];
    case 'COMPLETED':
      return [{ label: 'Archive', action: 'archive', icon: 'archive' }];
    default:
      return [];
  }
}

// =============================================================================
// Statistics Computation
// =============================================================================

/** Compute aggregate stats from experiment list */
export function computeExperimentStats(experiments: ExperimentSummary[]): ExperimentStats {
  const running = experiments.filter((e) => e.status === 'RUNNING').length;
  const completed = experiments.filter((e) => e.status === 'COMPLETED').length;
  const significant = experiments.filter((e) => e.isSignificant === true).length;
  const avgProgress =
    experiments.length > 0
      ? Math.round(experiments.reduce((sum, e) => sum + e.progressPercent, 0) / experiments.length)
      : 0;

  return {
    total: experiments.length,
    running,
    completed,
    significant,
    avgProgress,
  };
}
