/**
 * AI Model Monitoring Module
 * Exports all monitoring capabilities for AI operations.
 *
 * @module monitoring
 * @task IFC-117
 */

// Import for internal use
import {
  driftDetector as _driftDetector,
  getDriftMetrics as _getDriftMetrics,
} from './drift-detector';
import {
  hallucinationChecker as _hallucinationChecker,
  getHallucinationMetrics as _getHallucinationMetrics,
} from './hallucination-checker';
import {
  roiTracker as _roiTracker,
  getROIMetrics as _getROIMetrics,
} from './roi-tracker';
import {
  latencyMonitor as _latencyMonitor,
  getLatencyMetrics as _getLatencyMetrics,
} from './latency-monitor';

// Drift Detection
export {
  DriftDetector,
  driftDetector,
  defaultDriftConfig,
  getDriftMetrics,
} from './drift-detector';
export type {
  DriftWindow,
  DriftResult,
  DriftDetectorConfig,
  DriftSample,
  DriftMetricType,
} from './drift-detector';

// Hallucination Detection
export {
  HallucinationChecker,
  hallucinationChecker,
  defaultHallucinationConfig,
  getHallucinationMetrics,
} from './hallucination-checker';
export type {
  HallucinationType,
  HallucinationResult,
  HallucinationStats,
  HallucinationCheckerConfig,
} from './hallucination-checker';

// ROI Tracking
export {
  ROITracker,
  roiTracker,
  defaultROIConfig,
  getROIMetrics,
} from './roi-tracker';
export type {
  ValueType,
  AICost,
  AIValue,
  ROIResult,
  ROITrackerConfig,
  ROIStats,
} from './roi-tracker';

// Latency Monitoring
export {
  LatencyMonitor,
  latencyMonitor,
  defaultLatencyConfig,
  getLatencyMetrics,
  withLatencyTracking,
} from './latency-monitor';
export type {
  LatencyMeasurement,
  LatencyPhase,
  LatencyPercentiles,
  LatencyStats,
  SLOCompliance,
  LatencyMonitorConfig,
  LatencyAlert,
} from './latency-monitor';

/**
 * Get all Prometheus metrics from monitoring modules
 */
export function getAllMetrics(): string {
  let allMetrics = '';

  allMetrics += _getDriftMetrics();
  allMetrics += '\n';
  allMetrics += _getHallucinationMetrics();
  allMetrics += '\n';
  allMetrics += _getROIMetrics();
  allMetrics += '\n';
  allMetrics += _getLatencyMetrics();

  return allMetrics;
}

/**
 * Get combined monitoring status
 */
export function getMonitoringStatus(): {
  drift: ReturnType<typeof _driftDetector.getStatus>;
  hallucination: ReturnType<typeof _hallucinationChecker.getStats>;
  roi: ReturnType<typeof _roiTracker.getStats>;
  latency: ReturnType<typeof _latencyMonitor.getStats>;
  healthy: boolean;
  issues: string[];
} {
  const driftStatus = _driftDetector.getStatus();
  const hallucinationStats = _hallucinationChecker.getStats();
  const roiStats = _roiTracker.getStats();
  const latencyStats = _latencyMonitor.getStats();

  const issues: string[] = [];

  // Check for drift issues
  if (driftStatus.highSeverityCount > 0) {
    issues.push(`${driftStatus.highSeverityCount} high-severity drift detection(s)`);
  }

  // Check hallucination rate
  if (!hallucinationStats.kpiCompliant) {
    issues.push(`Hallucination rate ${(hallucinationStats.hallucinationRate * 100).toFixed(1)}% exceeds 5% target`);
  }

  // Check ROI
  if (roiStats.currentROI < 0) {
    issues.push(`Negative ROI: ${roiStats.currentROI.toFixed(1)}%`);
  }

  // Check latency SLO
  if (!latencyStats.sloCompliance.overallCompliant) {
    issues.push(`Latency SLO violation: P95=${latencyStats.sloCompliance.p95Actual.toFixed(0)}ms (target: ${latencyStats.sloCompliance.p95Target}ms)`);
  }

  return {
    drift: driftStatus,
    hallucination: hallucinationStats,
    roi: roiStats,
    latency: latencyStats,
    healthy: issues.length === 0,
    issues,
  };
}
