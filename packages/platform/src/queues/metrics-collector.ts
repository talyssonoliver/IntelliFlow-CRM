/**
 * Job Metrics Collector
 *
 * Collects and aggregates metrics from BullMQ job processing:
 * - Job counts by status
 * - Processing latency percentiles
 * - Throughput rates
 * - Error rates and categories
 */

import type { JobMetrics, JobEvent } from './types';

// ============================================================================
// Metrics Data Structures
// ============================================================================

interface TimestampedValue {
  value: number;
  timestamp: number;
}

interface LatencyBucket {
  count: number;
  totalMs: number;
  values: number[];
}

// ============================================================================
// Job Metrics Collector
// ============================================================================

export class JobMetricsCollector {
  private readonly queueName: string;
  private readonly windowMs: number;
  private readonly maxSamples: number;

  // Job counts
  private completedCount = 0;
  private failedCount = 0;
  private activeCount = 0;
  private waitingCount = 0;

  // Timing samples for latency calculation
  private waitTimeSamples: TimestampedValue[] = [];
  private processTimeSamples: TimestampedValue[] = [];

  // Rate calculation windows
  private completedInWindow: TimestampedValue[] = [];
  private failedInWindow: TimestampedValue[] = [];

  // Error tracking
  private errorCounts: Map<string, number> = new Map();

  constructor(queueName: string, windowMs = 60000, maxSamples = 1000) {
    this.queueName = queueName;
    this.windowMs = windowMs;
    this.maxSamples = maxSamples;
  }

  // ============================================================================
  // Event Recording
  // ============================================================================

  /**
   * Record a job event
   */
  recordEvent(event: JobEvent): void {
    const now = Date.now();

    switch (event.eventType) {
      case 'added':
        this.waitingCount++;
        break;

      case 'active':
        this.activeCount++;
        if (this.waitingCount > 0) this.waitingCount--;
        break;

      case 'completed':
        this.completedCount++;
        if (this.activeCount > 0) this.activeCount--;
        this.completedInWindow.push({ value: 1, timestamp: now });
        if (event.duration !== undefined) {
          this.addTimingSample(this.processTimeSamples, event.duration);
        }
        break;

      case 'failed':
        this.failedCount++;
        if (this.activeCount > 0) this.activeCount--;
        this.failedInWindow.push({ value: 1, timestamp: now });
        if (event.error) {
          this.recordError(event.error);
        }
        break;

      case 'stalled':
        // Stalled jobs will be retried, track as a warning
        this.recordError('job_stalled');
        break;
    }

    // Cleanup old data
    this.pruneOldData(now);
  }

  /**
   * Record wait time for a job
   */
  recordWaitTime(waitTimeMs: number): void {
    this.addTimingSample(this.waitTimeSamples, waitTimeMs);
  }

  /**
   * Record processing time for a job
   */
  recordProcessTime(processTimeMs: number): void {
    this.addTimingSample(this.processTimeSamples, processTimeMs);
  }

  /**
   * Record an error category
   */
  recordError(errorMessage: string): void {
    const category = this.categorizeError(errorMessage);
    const current = this.errorCounts.get(category) || 0;
    this.errorCounts.set(category, current + 1);
  }

  // ============================================================================
  // Metrics Retrieval
  // ============================================================================

  /**
   * Get current metrics snapshot
   */
  getMetrics(): JobMetrics {
    const now = Date.now();
    this.pruneOldData(now);

    return {
      queueName: this.queueName,
      timestamp: new Date(now).toISOString(),
      counts: {
        waiting: this.waitingCount,
        active: this.activeCount,
        completed: this.completedCount,
        failed: this.failedCount,
        delayed: 0, // Would need queue access to get this
        paused: 0, // Would need queue access to get this
      },
      processingRates: {
        completedPerMinute: this.calculateRate(this.completedInWindow, now),
        failedPerMinute: this.calculateRate(this.failedInWindow, now),
      },
      latency: {
        averageWaitTimeMs: this.calculateAverage(this.waitTimeSamples),
        averageProcessTimeMs: this.calculateAverage(this.processTimeSamples),
        p95WaitTimeMs: this.calculatePercentile(this.waitTimeSamples, 95),
        p95ProcessTimeMs: this.calculatePercentile(this.processTimeSamples, 95),
      },
    };
  }

  /**
   * Get error breakdown
   */
  getErrorBreakdown(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }

  /**
   * Export metrics as JSON for persistence
   */
  toJSON(): object {
    return {
      queueName: this.queueName,
      collectedAt: new Date().toISOString(),
      metrics: this.getMetrics(),
      errors: this.getErrorBreakdown(),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.completedCount = 0;
    this.failedCount = 0;
    this.activeCount = 0;
    this.waitingCount = 0;
    this.waitTimeSamples = [];
    this.processTimeSamples = [];
    this.completedInWindow = [];
    this.failedInWindow = [];
    this.errorCounts.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private addTimingSample(samples: TimestampedValue[], value: number): void {
    samples.push({ value, timestamp: Date.now() });

    // Keep samples within limit
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  private pruneOldData(now: number): void {
    const cutoff = now - this.windowMs;

    this.completedInWindow = this.completedInWindow.filter((s) => s.timestamp > cutoff);
    this.failedInWindow = this.failedInWindow.filter((s) => s.timestamp > cutoff);
    this.waitTimeSamples = this.waitTimeSamples.filter((s) => s.timestamp > cutoff);
    this.processTimeSamples = this.processTimeSamples.filter((s) => s.timestamp > cutoff);
  }

  private calculateRate(samples: TimestampedValue[], now: number): number {
    const cutoff = now - this.windowMs;
    const recentSamples = samples.filter((s) => s.timestamp > cutoff);
    const minutesFraction = this.windowMs / 60000;
    return recentSamples.length / minutesFraction;
  }

  private calculateAverage(samples: TimestampedValue[]): number {
    if (samples.length === 0) return 0;
    const sum = samples.reduce((acc, s) => acc + s.value, 0);
    return Math.round(sum / samples.length);
  }

  private calculatePercentile(samples: TimestampedValue[], percentile: number): number {
    if (samples.length === 0) return 0;

    const sorted = samples.map((s) => s.value).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private categorizeError(errorMessage: string): string {
    const message = errorMessage.toLowerCase();

    if (message.includes('timeout')) return 'timeout';
    if (message.includes('connection')) return 'connection';
    if (message.includes('rate limit') || message.includes('429')) return 'rate_limit';
    if (message.includes('auth') || message.includes('401') || message.includes('403')) return 'auth';
    if (message.includes('not found') || message.includes('404')) return 'not_found';
    if (message.includes('500') || message.includes('server error')) return 'server_error';
    if (message.includes('stalled')) return 'stalled';

    return 'other';
  }
}

// ============================================================================
// Aggregate Metrics Collector
// ============================================================================

/**
 * Collects metrics across all queues
 */
export class AggregateMetricsCollector {
  private collectors: Map<string, JobMetricsCollector> = new Map();

  /**
   * Get or create collector for a queue
   */
  getCollector(queueName: string): JobMetricsCollector {
    if (!this.collectors.has(queueName)) {
      this.collectors.set(queueName, new JobMetricsCollector(queueName));
    }
    return this.collectors.get(queueName)!;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, JobMetrics> {
    const result: Record<string, JobMetrics> = {};
    for (const [name, collector] of this.collectors) {
      result[name] = collector.getMetrics();
    }
    return result;
  }

  /**
   * Export all metrics to JSON for persistence
   */
  exportToJSON(): object {
    return {
      exportedAt: new Date().toISOString(),
      queues: Object.fromEntries(Array.from(this.collectors.entries()).map(([name, collector]) => [name, collector.toJSON()])),
    };
  }

  /**
   * Reset all collectors
   */
  resetAll(): void {
    for (const collector of this.collectors.values()) {
      collector.reset();
    }
  }
}

// Singleton instance
export const globalMetricsCollector = new AggregateMetricsCollector();
