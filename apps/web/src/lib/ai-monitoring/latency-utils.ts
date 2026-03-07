/**
 * Latency Monitor Dashboard Utilities (PG-153)
 *
 * Badge classes, colors, icons, and formatting for latency monitoring.
 * Pattern: apps/web/src/lib/ai-monitoring/drift-utils.ts
 */

import type { LatencyPhase } from './types';

export function formatLatencyMs(ms: number): string {
  if (ms < 0) return '< 1ms';
  if (ms < 1) return '< 1ms';
  return `${Math.round(ms).toLocaleString()}ms`;
}

export function getSLOBadgeClass(compliant: boolean): string {
  return compliant
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
}

export function getSLOStatusLabel(compliant: boolean): string {
  return compliant ? 'PASS' : 'FAIL';
}

export function getLatencyAlertBadgeClass(severity: 'warning' | 'critical'): string {
  return severity === 'critical'
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
}

export function getLatencyAlertIcon(severity: 'warning' | 'critical'): string {
  return severity === 'critical' ? 'error' : 'warning';
}

const PHASE_LABELS: Record<LatencyPhase, string> = {
  queue_wait: 'Queue Wait',
  preprocessing: 'Preprocessing',
  model_inference: 'Model Inference',
  postprocessing: 'Postprocessing',
  total: 'Total',
};

export function formatPhaseLabel(phase: LatencyPhase): string {
  return PHASE_LABELS[phase] ?? phase;
}

export function getP95ComplianceColor(actual: number, target: number): string {
  if (target <= 0) return 'text-muted-foreground';
  const ratio = actual / target;
  if (ratio <= 1) return 'text-green-600 dark:text-green-400';
  if (ratio <= 1.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function isStaleLatencyData(timestamp: string | null): boolean {
  if (!timestamp) return false;
  const diff = Date.now() - new Date(timestamp).getTime();
  return diff > 3600000; // 1 hour
}
