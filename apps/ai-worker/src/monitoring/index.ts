/**
 * AI Model Monitoring Module
 * Exports all monitoring capabilities for AI operations.
 *
 * @module monitoring
 * @task IFC-117
 */

// Import for internal use
import { driftDetector as _driftDetector } from './drift-detector';
import { hallucinationChecker as _hallucinationChecker } from './hallucination-checker';
import { roiTracker as _roiTracker } from './roi-tracker';
import { latencyMonitor as _latencyMonitor } from './latency-monitor';

// Drift Detection
export { DriftDetector, driftDetector, defaultDriftConfig } from './drift-detector';
export { DriftDetectionScheduler, SCHEDULED_DRIFT_METRICS } from './drift-scheduler';
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
} from './hallucination-checker';
export type {
  HallucinationType,
  HallucinationResult,
  HallucinationStats,
  HallucinationCheckerConfig,
} from './hallucination-checker';

// ROI Tracking
export { ROITracker, roiTracker, defaultROIConfig } from './roi-tracker';
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

// Chain Monitor (Unified Orchestrator)
export {
  ChainMonitor,
  chainMonitor,
  createChainMonitor,
  withMonitoring,
  sanitizeMetricLabel,
} from './chain-monitor';
export type { ChainMonitorConfig, MonitoredResult } from './chain-monitor';

// IFC-117: AI metrics go out through OTel (OTLP), not a Prometheus text endpoint.
export {
  registerAiMetrics,
  recordDriftTick,
  recordRetrainingTrigger,
  AI_METRIC_DEFINITIONS,
  AI_ALERT_THRESHOLDS,
} from './otel-ai-metrics';
export type { ChainId, DriftTickResult, HallucinationOutcome } from './otel-ai-types';

export { MonitoringFlushService } from './monitoring-flush.service';

// IFC-214: Redis-backed live snapshot publisher (paired with API-side store).
export {
  RedisMonitoringPublisher,
  redisKey as redisMonitoringKey,
} from './redis-monitoring-publisher';
export type {
  RedisLike as MonitoringRedisLike,
  SnapshotKind as MonitoringSnapshotKind,
  RedisMonitoringPublisherOptions,
} from './redis-monitoring-publisher';

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
    issues.push(
      `Hallucination rate ${(hallucinationStats.hallucinationRate * 100).toFixed(1)}% exceeds 5% target`
    );
  }

  // Check ROI
  if (roiStats.currentROI < 0) {
    issues.push(`Negative ROI: ${roiStats.currentROI.toFixed(1)}%`);
  }

  // Check latency SLO
  if (!latencyStats.sloCompliance.overallCompliant) {
    issues.push(
      `Latency SLO violation: P95=${latencyStats.sloCompliance.p95Actual.toFixed(0)}ms (target: ${latencyStats.sloCompliance.p95Target}ms)`
    );
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
