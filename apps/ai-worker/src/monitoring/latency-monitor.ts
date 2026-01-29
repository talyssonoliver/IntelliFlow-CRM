/**
 * AI Latency Monitor
 * Tracks and analyzes latency metrics for AI operations.
 * Enables SLO compliance monitoring and performance optimization.
 *
 * @module latency-monitor
 * @task IFC-117
 */

import pino from 'pino';

const logger = pino({
  name: 'latency-monitor',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Latency measurement for a single operation
 */
export interface LatencyMeasurement {
  id: string;
  timestamp: Date;
  model: string;
  operationType: string;
  phase: LatencyPhase;
  durationMs: number;
  success: boolean;
  errorType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Phases of AI operation for latency breakdown
 */
export type LatencyPhase =
  | 'queue_wait' // Time waiting in queue
  | 'preprocessing' // Input preparation
  | 'model_inference' // Actual AI inference
  | 'postprocessing' // Output processing
  | 'total'; // End-to-end latency

/**
 * Latency percentile statistics
 */
export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  mean: number;
  stdDev: number;
}

/**
 * Latency statistics for a time period
 */
export interface LatencyStats {
  periodStart: Date;
  periodEnd: Date;
  sampleCount: number;
  successRate: number;
  percentiles: LatencyPercentiles;
  byModel: Record<string, LatencyPercentiles>;
  byOperation: Record<string, LatencyPercentiles>;
  byPhase: Record<LatencyPhase, LatencyPercentiles>;
  sloCompliance: SLOCompliance;
}

/**
 * SLO (Service Level Objective) compliance status
 */
export interface SLOCompliance {
  p95Target: number;
  p99Target: number;
  p95Actual: number;
  p99Actual: number;
  p95Compliant: boolean;
  p99Compliant: boolean;
  overallCompliant: boolean;
  complianceRate: number;
}

/**
 * Configuration for latency monitoring
 */
export interface LatencyMonitorConfig {
  sloTargets: {
    p95Ms: number;
    p99Ms: number;
  };
  alertThresholds: {
    p95MultiplierWarning: number;
    p95MultiplierCritical: number;
  };
  retentionHours: number;
  samplingRate: number; // 1.0 = 100% sampling
}

/**
 * Latency alert
 */
export interface LatencyAlert {
  id: string;
  timestamp: Date;
  severity: 'warning' | 'critical';
  model: string;
  operationType: string;
  message: string;
  currentP95: number;
  targetP95: number;
  samples: number;
}

/**
 * Latency Monitor Service
 * Comprehensive latency tracking with SLO compliance
 */
export class LatencyMonitor {
  private measurements: LatencyMeasurement[] = [];
  private alerts: LatencyAlert[] = [];
  private operationTimers: Map<string, { startTime: number; phases: Record<string, number> }> = new Map();

  constructor(private readonly config: LatencyMonitorConfig) {
    logger.info({ config }, 'LatencyMonitor initialized');
  }

  /**
   * Start timing an operation
   */
  startOperation(operationId: string): void {
    this.operationTimers.set(operationId, {
      startTime: Date.now(),
      phases: {},
    });

    logger.debug({ operationId }, 'Operation timing started');
  }

  /**
   * Mark phase completion
   */
  markPhase(operationId: string, phase: LatencyPhase): void {
    const timer = this.operationTimers.get(operationId);
    if (timer) {
      timer.phases[phase] = Date.now();
      logger.debug({ operationId, phase }, 'Phase marked');
    }
  }

  /**
   * Complete operation timing and record measurements
   */
  completeOperation(
    operationId: string,
    params: {
      model: string;
      operationType: string;
      success: boolean;
      errorType?: string;
      metadata?: Record<string, unknown>;
    }
  ): LatencyMeasurement[] {
    const timer = this.operationTimers.get(operationId);
    if (!timer) {
      logger.warn({ operationId }, 'No timer found for operation');
      return [];
    }

    const endTime = Date.now();
    const totalDuration = endTime - timer.startTime;
    const measurements: LatencyMeasurement[] = [];

    // Record total latency
    const totalMeasurement: LatencyMeasurement = {
      id: `${operationId}-total`,
      timestamp: new Date(),
      model: params.model,
      operationType: params.operationType,
      phase: 'total',
      durationMs: totalDuration,
      success: params.success,
      errorType: params.errorType,
      metadata: params.metadata,
    };
    measurements.push(totalMeasurement);

    // Record phase latencies
    const sortedPhases = Object.entries(timer.phases).sort((a, b) => a[1] - b[1]);
    let previousTime = timer.startTime;

    for (const [phase, timestamp] of sortedPhases) {
      const phaseDuration = timestamp - previousTime;
      measurements.push({
        id: `${operationId}-${phase}`,
        timestamp: new Date(),
        model: params.model,
        operationType: params.operationType,
        phase: phase as LatencyPhase,
        durationMs: phaseDuration,
        success: params.success,
        errorType: params.errorType,
        metadata: params.metadata,
      });
      previousTime = timestamp;
    }

    // Apply sampling
    if (Math.random() <= this.config.samplingRate) {
      this.measurements.push(...measurements);
    }

    // Clean up timer
    this.operationTimers.delete(operationId);

    // Check SLO and generate alerts
    this.checkSLOCompliance(params.model, params.operationType, totalDuration);

    logger.debug(
      {
        operationId,
        model: params.model,
        totalDuration,
        success: params.success,
        phaseCount: measurements.length - 1,
      },
      'Operation completed'
    );

    return measurements;
  }

  /**
   * Record a single latency measurement directly
   */
  recordMeasurement(measurement: Omit<LatencyMeasurement, 'timestamp'>): LatencyMeasurement {
    const entry: LatencyMeasurement = {
      ...measurement,
      timestamp: new Date(),
    };

    if (Math.random() <= this.config.samplingRate) {
      this.measurements.push(entry);
    }

    if (measurement.phase === 'total') {
      this.checkSLOCompliance(
        measurement.model,
        measurement.operationType,
        measurement.durationMs
      );
    }

    return entry;
  }

  /**
   * Get latency statistics for a period
   */
  getStats(startTime?: Date, endTime?: Date): LatencyStats {
    const start = startTime ?? new Date(Date.now() - 60 * 60 * 1000); // Default: last hour
    const end = endTime ?? new Date();

    const periodMeasurements = this.measurements.filter(
      m => m.timestamp >= start && m.timestamp <= end
    );

    // Filter to total latency measurements
    const totalMeasurements = periodMeasurements.filter(m => m.phase === 'total');
    const durations = totalMeasurements.map(m => m.durationMs);

    // Calculate overall percentiles
    const percentiles = this.calculatePercentiles(durations);

    // Success rate
    const successCount = totalMeasurements.filter(m => m.success).length;
    const successRate = totalMeasurements.length > 0
      ? successCount / totalMeasurements.length
      : 1;

    // By model
    const byModel: Record<string, LatencyPercentiles> = {};
    const modelGroups = this.groupBy(totalMeasurements, m => m.model);
    for (const [model, measurements] of Object.entries(modelGroups)) {
      byModel[model] = this.calculatePercentiles(measurements.map(m => m.durationMs));
    }

    // By operation
    const byOperation: Record<string, LatencyPercentiles> = {};
    const opGroups = this.groupBy(totalMeasurements, m => m.operationType);
    for (const [op, measurements] of Object.entries(opGroups)) {
      byOperation[op] = this.calculatePercentiles(measurements.map(m => m.durationMs));
    }

    // By phase
    const byPhase: Record<string, LatencyPercentiles> = {};
    const phaseGroups = this.groupBy(periodMeasurements, m => m.phase);
    for (const [phase, measurements] of Object.entries(phaseGroups)) {
      byPhase[phase] = this.calculatePercentiles(measurements.map(m => m.durationMs));
    }

    // SLO compliance
    const sloCompliance = this.calculateSLOCompliance(percentiles);

    return {
      periodStart: start,
      periodEnd: end,
      sampleCount: totalMeasurements.length,
      successRate,
      percentiles,
      byModel,
      byOperation,
      byPhase: byPhase as Record<LatencyPhase, LatencyPercentiles>,
      sloCompliance,
    };
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 50): LatencyAlert[] {
    return [...this.alerts]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get latency trend over time
   */
  getTrend(
    periodMinutes: number = 60,
    bucketMinutes: number = 5
  ): Array<{ timestamp: Date; p50: number; p95: number; p99: number; count: number }> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - periodMinutes * 60 * 1000);

    const totalMeasurements = this.measurements.filter(
      m => m.phase === 'total' && m.timestamp >= periodStart
    );

    const buckets: Map<number, LatencyMeasurement[]> = new Map();
    const bucketMs = bucketMinutes * 60 * 1000;

    for (const m of totalMeasurements) {
      const bucketKey = Math.floor(m.timestamp.getTime() / bucketMs) * bucketMs;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(m);
    }

    const trend: Array<{ timestamp: Date; p50: number; p95: number; p99: number; count: number }> = [];

    const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
    for (const bucketKey of sortedKeys) {
      const measurements = buckets.get(bucketKey)!;
      const durations = measurements.map(m => m.durationMs);
      const percentiles = this.calculatePercentiles(durations);

      trend.push({
        timestamp: new Date(bucketKey),
        p50: percentiles.p50,
        p95: percentiles.p95,
        p99: percentiles.p99,
        count: measurements.length,
      });
    }

    return trend;
  }

  /**
   * Get slow operations (above P95 threshold)
   */
  getSlowOperations(limit: number = 100): LatencyMeasurement[] {
    const totalMeasurements = this.measurements.filter(m => m.phase === 'total');

    return [...totalMeasurements]
      .filter(m => m.durationMs > this.config.sloTargets.p95Ms)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, limit);
  }

  /**
   * Calculate percentiles from durations
   */
  private calculatePercentiles(durations: number[]): LatencyPercentiles {
    if (durations.length === 0) {
      return {
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        max: 0,
        min: 0,
        mean: 0,
        stdDev: 0,
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const n = sorted.length;

    const percentile = (p: number): number => {
      const index = (p / 100) * (n - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const fraction = index - lower;

      if (upper >= n) return sorted[n - 1];
      return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
    };

    const mean = durations.reduce((sum, d) => sum + d, 0) / n;
    const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      max: sorted[n - 1],
      min: sorted[0],
      mean,
      stdDev,
    };
  }

  /**
   * Group measurements by key
   */
  private groupBy<T, K extends string>(
    items: T[],
    keyFn: (item: T) => K
  ): Record<K, T[]> {
    const groups: Record<string, T[]> = {};

    for (const item of items) {
      const key = keyFn(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }

    return groups as Record<K, T[]>;
  }

  /**
   * Calculate SLO compliance
   */
  private calculateSLOCompliance(percentiles: LatencyPercentiles): SLOCompliance {
    const p95Compliant = percentiles.p95 <= this.config.sloTargets.p95Ms;
    const p99Compliant = percentiles.p99 <= this.config.sloTargets.p99Ms;

    return {
      p95Target: this.config.sloTargets.p95Ms,
      p99Target: this.config.sloTargets.p99Ms,
      p95Actual: percentiles.p95,
      p99Actual: percentiles.p99,
      p95Compliant,
      p99Compliant,
      overallCompliant: p95Compliant && p99Compliant,
      complianceRate: ((p95Compliant ? 1 : 0) + (p99Compliant ? 1 : 0)) / 2,
    };
  }

  /**
   * Check SLO compliance and generate alerts
   */
  private checkSLOCompliance(
    model: string,
    operationType: string,
    duration: number
  ): void {
    const { p95Ms } = this.config.sloTargets;
    const { p95MultiplierWarning, p95MultiplierCritical } = this.config.alertThresholds;

    const warningThreshold = p95Ms * p95MultiplierWarning;
    const criticalThreshold = p95Ms * p95MultiplierCritical;

    if (duration >= criticalThreshold) {
      this.createAlert('critical', model, operationType, duration);
    } else if (duration >= warningThreshold) {
      this.createAlert('warning', model, operationType, duration);
    }
  }

  /**
   * Create a latency alert
   */
  private createAlert(
    severity: 'warning' | 'critical',
    model: string,
    operationType: string,
    duration: number
  ): void {
    const alert: LatencyAlert = {
      id: `latency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      severity,
      model,
      operationType,
      message: `${severity.toUpperCase()}: Latency ${duration.toFixed(0)}ms exceeds P95 target ${this.config.sloTargets.p95Ms}ms for ${operationType} on ${model}`,
      currentP95: duration,
      targetP95: this.config.sloTargets.p95Ms,
      samples: 1,
    };

    this.alerts.push(alert);

    logger.warn(
      {
        severity,
        model,
        operationType,
        duration,
        targetP95: this.config.sloTargets.p95Ms,
      },
      'Latency alert generated'
    );
  }

  /**
   * Prune old measurements (retention policy)
   */
  pruneOldData(): number {
    const cutoff = new Date(Date.now() - this.config.retentionHours * 60 * 60 * 1000);
    const originalCount = this.measurements.length;

    this.measurements = this.measurements.filter(m => m.timestamp > cutoff);
    this.alerts = this.alerts.filter(a => a.timestamp > cutoff);

    const pruned = originalCount - this.measurements.length;
    if (pruned > 0) {
      logger.info({ pruned, retained: this.measurements.length }, 'Old latency data pruned');
    }

    return pruned;
  }

  /**
   * Export latency report
   */
  exportReport(): string {
    const stats = this.getStats();

    let report = '=== AI Latency Report ===\n\n';
    report += `Period: ${stats.periodStart.toISOString()} to ${stats.periodEnd.toISOString()}\n`;
    report += `Samples: ${stats.sampleCount}\n`;
    report += `Success Rate: ${(stats.successRate * 100).toFixed(1)}%\n\n`;

    report += '--- Overall Latency ---\n';
    report += `  P50: ${stats.percentiles.p50.toFixed(1)}ms\n`;
    report += `  P75: ${stats.percentiles.p75.toFixed(1)}ms\n`;
    report += `  P90: ${stats.percentiles.p90.toFixed(1)}ms\n`;
    report += `  P95: ${stats.percentiles.p95.toFixed(1)}ms\n`;
    report += `  P99: ${stats.percentiles.p99.toFixed(1)}ms\n`;
    report += `  Max: ${stats.percentiles.max.toFixed(1)}ms\n`;
    report += `  Mean: ${stats.percentiles.mean.toFixed(1)}ms\n`;
    report += `  StdDev: ${stats.percentiles.stdDev.toFixed(1)}ms\n\n`;

    report += '--- SLO Compliance ---\n';
    report += `  P95 Target: ${stats.sloCompliance.p95Target}ms\n`;
    report += `  P95 Actual: ${stats.sloCompliance.p95Actual.toFixed(1)}ms\n`;
    report += `  P95 Compliant: ${stats.sloCompliance.p95Compliant ? 'YES' : 'NO'}\n`;
    report += `  P99 Target: ${stats.sloCompliance.p99Target}ms\n`;
    report += `  P99 Actual: ${stats.sloCompliance.p99Actual.toFixed(1)}ms\n`;
    report += `  P99 Compliant: ${stats.sloCompliance.p99Compliant ? 'YES' : 'NO'}\n`;
    report += `  Overall Compliance: ${(stats.sloCompliance.complianceRate * 100).toFixed(0)}%\n\n`;

    report += '--- By Model ---\n';
    for (const [model, p] of Object.entries(stats.byModel)) {
      report += `  ${model}: P50=${p.p50.toFixed(0)}ms, P95=${p.p95.toFixed(0)}ms, P99=${p.p99.toFixed(0)}ms\n`;
    }

    report += '\n--- By Operation ---\n';
    for (const [op, p] of Object.entries(stats.byOperation)) {
      report += `  ${op}: P50=${p.p50.toFixed(0)}ms, P95=${p.p95.toFixed(0)}ms, P99=${p.p99.toFixed(0)}ms\n`;
    }

    report += '\n--- By Phase ---\n';
    for (const [phase, p] of Object.entries(stats.byPhase)) {
      report += `  ${phase}: Mean=${p.mean.toFixed(0)}ms, P95=${p.p95.toFixed(0)}ms\n`;
    }

    return report;
  }
}

/**
 * Default latency monitor configuration
 * Targets from Sprint_plan.csv: AI scoring <2s
 */
export const defaultLatencyConfig: LatencyMonitorConfig = {
  sloTargets: {
    p95Ms: 2000, // 2 seconds for AI scoring
    p99Ms: 5000, // 5 seconds maximum
  },
  alertThresholds: {
    p95MultiplierWarning: 1.5, // Alert at 1.5x P95 target
    p95MultiplierCritical: 2.0, // Critical at 2x P95 target
  },
  retentionHours: 72, // Keep 3 days of data
  samplingRate: 1.0, // 100% sampling
};

/**
 * Global latency monitor instance
 */
export const latencyMonitor = new LatencyMonitor(defaultLatencyConfig);

/**
 * Prometheus metrics format for latency monitoring
 */
export function getLatencyMetrics(): string {
  const stats = latencyMonitor.getStats();

  let metrics = '';

  // Histogram buckets
  const buckets = [100, 250, 500, 1000, 2000, 5000, 10000];

  metrics += `# HELP intelliflow_ai_latency_seconds AI operation latency in seconds\n`;
  metrics += `# TYPE intelliflow_ai_latency_seconds histogram\n`;

  // Approximate bucket counts from percentiles
  const totalMeasurements = stats.sampleCount;
  for (const bucket of buckets) {
    const ratio = bucket <= stats.percentiles.p50 ? 0.5 :
                  bucket <= stats.percentiles.p75 ? 0.75 :
                  bucket <= stats.percentiles.p90 ? 0.90 :
                  bucket <= stats.percentiles.p95 ? 0.95 :
                  bucket <= stats.percentiles.p99 ? 0.99 : 1.0;
    const count = Math.round(totalMeasurements * ratio);
    metrics += `intelliflow_ai_latency_seconds_bucket{le="${(bucket / 1000).toFixed(3)}"} ${count}\n`;
  }
  metrics += `intelliflow_ai_latency_seconds_bucket{le="+Inf"} ${totalMeasurements}\n`;
  metrics += `intelliflow_ai_latency_seconds_count ${totalMeasurements}\n`;
  metrics += `intelliflow_ai_latency_seconds_sum ${(totalMeasurements * stats.percentiles.mean / 1000).toFixed(3)}\n`;

  // Percentile gauges
  metrics += `# HELP intelliflow_ai_latency_p95_ms P95 latency in milliseconds\n`;
  metrics += `# TYPE intelliflow_ai_latency_p95_ms gauge\n`;
  metrics += `intelliflow_ai_latency_p95_ms ${stats.percentiles.p95.toFixed(1)}\n`;

  metrics += `# HELP intelliflow_ai_latency_p99_ms P99 latency in milliseconds\n`;
  metrics += `# TYPE intelliflow_ai_latency_p99_ms gauge\n`;
  metrics += `intelliflow_ai_latency_p99_ms ${stats.percentiles.p99.toFixed(1)}\n`;

  // SLO compliance
  metrics += `# HELP intelliflow_ai_slo_compliant SLO compliance status (1=compliant, 0=not)\n`;
  metrics += `# TYPE intelliflow_ai_slo_compliant gauge\n`;
  metrics += `intelliflow_ai_slo_compliant{slo="p95"} ${stats.sloCompliance.p95Compliant ? 1 : 0}\n`;
  metrics += `intelliflow_ai_slo_compliant{slo="p99"} ${stats.sloCompliance.p99Compliant ? 1 : 0}\n`;

  // Success rate
  metrics += `# HELP intelliflow_ai_success_rate AI operation success rate (0-1)\n`;
  metrics += `# TYPE intelliflow_ai_success_rate gauge\n`;
  metrics += `intelliflow_ai_success_rate ${stats.successRate.toFixed(4)}\n`;

  // Per-model latencies
  metrics += `# HELP intelliflow_ai_latency_by_model_p95_ms P95 latency by model in milliseconds\n`;
  metrics += `# TYPE intelliflow_ai_latency_by_model_p95_ms gauge\n`;
  for (const [model, p] of Object.entries(stats.byModel)) {
    metrics += `intelliflow_ai_latency_by_model_p95_ms{model="${model}"} ${p.p95.toFixed(1)}\n`;
  }

  return metrics;
}

/**
 * Convenience function to time an async operation
 */
export async function withLatencyTracking<T>(
  operationId: string,
  model: string,
  operationType: string,
  fn: () => Promise<T>
): Promise<T> {
  latencyMonitor.startOperation(operationId);
  latencyMonitor.markPhase(operationId, 'preprocessing');

  try {
    latencyMonitor.markPhase(operationId, 'model_inference');
    const result = await fn();
    latencyMonitor.markPhase(operationId, 'postprocessing');

    latencyMonitor.completeOperation(operationId, {
      model,
      operationType,
      success: true,
    });

    return result;
  } catch (error) {
    latencyMonitor.completeOperation(operationId, {
      model,
      operationType,
      success: false,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}
