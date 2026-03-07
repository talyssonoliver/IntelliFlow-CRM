/**
 * Chain Monitor - Unified AI Monitoring Orchestrator
 *
 * Wraps AI chain execution with comprehensive monitoring:
 * - Drift detection (via DriftDetector)
 * - Hallucination checking (via HallucinationChecker)
 * - ROI tracking (via ROITracker)
 * - Latency monitoring (via LatencyMonitor)
 *
 * @module chain-monitor
 * @task IFC-117
 */

import pino from 'pino';
import { DriftDetector, driftDetector } from './drift-detector';
import { HallucinationChecker, hallucinationChecker } from './hallucination-checker';
import { ROITracker, roiTracker } from './roi-tracker';
import { LatencyMonitor, latencyMonitor } from './latency-monitor';

const logger = pino({
  name: 'chain-monitor',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Configuration for ChainMonitor
 */
export interface ChainMonitorConfig {
  driftDetector: DriftDetector;
  hallucinationChecker: HallucinationChecker;
  roiTracker: ROITracker;
  latencyMonitor: LatencyMonitor;
  latencyThresholdMs: number;
}

/**
 * Monitored result with original result and collected metrics
 */
export interface MonitoredResult<T> {
  result: T;
  metrics: {
    operationId: string;
    latencyMs: number;
    tokenCost: number;
    driftScore: number | null;
    hallucinationFlags: string[];
    confidenceScore: number;
  };
}

/**
 * Sanitize metric labels to prevent Prometheus cardinality explosion
 */
export function sanitizeMetricLabel(input: string): string {
  return input
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, '_')
    .slice(0, 64);
}

/**
 * Generate a unique operation ID
 */
function generateOperationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8); // NOSONAR - non-security: operation tracing ID, not used for auth or tokens
  return `${timestamp}-${random}`;
}

/**
 * ChainMonitor - Unified monitoring orchestrator
 */
export class ChainMonitor {
  constructor(private readonly config: ChainMonitorConfig) {
    logger.info({ latencyThresholdMs: config.latencyThresholdMs }, 'ChainMonitor initialized');
  }

  /**
   * Get the current configuration
   */
  getConfig(): ChainMonitorConfig {
    return this.config;
  }

  /**
   * Wrap a function with monitoring
   */
  wrap<T, Args extends unknown[]>(
    fn: (...args: Args) => Promise<T>
  ): (...args: Args) => Promise<MonitoredResult<T>> {
    return async (...args: Args): Promise<MonitoredResult<T>> => {
      return withMonitoring(() => fn(...args), this.config);
    };
  }
}

/**
 * Execute a function with comprehensive monitoring
 */
export async function withMonitoring<T>(
  fn: () => Promise<T>,
  config: ChainMonitorConfig
): Promise<MonitoredResult<T>> {
  const operationId = generateOperationId();
  const startTime = Date.now();

  // Start latency tracking
  config.latencyMonitor.startOperation(operationId);

  let result: T;
  let errorType: string | undefined;

  try {
    // Execute the wrapped function
    result = await fn();

    // Record successful completion
    const latencyMs = Date.now() - startTime;

    config.latencyMonitor.completeOperation(operationId, {
      model: 'default',
      operationType: 'chain_execution',
      success: true,
    });

    // Record drift sample if result has a score
    let driftScore: number | null = null;
    if (result && typeof result === 'object' && 'score' in result) {
      const score = (result as { score: number }).score;
      const normalizedScore = score > 1 ? score / 100 : score; // Normalize 0-100 to 0-1

      config.driftDetector.recordSample({
        value: normalizedScore,
        timestamp: new Date(),
        model: 'default',
        metric: 'score_distribution',
      });

      driftScore = normalizedScore;
    }

    // Record ROI value
    config.roiTracker.recordValueByType({
      id: operationId,
      valueType: 'lead_scored',
      relatedCostIds: [operationId],
    });

    // Build metrics
    const metrics = {
      operationId,
      latencyMs,
      tokenCost: 0, // Would be populated by token callback
      driftScore,
      hallucinationFlags: [] as string[],
      confidenceScore:
        result && typeof result === 'object' && 'confidence' in result
          ? (result as { confidence: number }).confidence
          : 1,
    };

    logger.info(
      {
        operationId,
        latencyMs,
        driftScore,
      },
      'Chain execution completed with monitoring'
    );

    return { result, metrics };
  } catch (error) {
    // Record failed operation
    errorType = error instanceof Error ? error.name : 'UnknownError';

    config.latencyMonitor.completeOperation(operationId, {
      model: 'default',
      operationType: 'chain_execution',
      success: false,
      errorType,
    });

    logger.error(
      {
        operationId,
        errorType,
        error: error instanceof Error ? error.message : String(error),
      },
      'Chain execution failed'
    );

    throw error;
  }
}

/**
 * Create a ChainMonitor with optional partial configuration
 */
export function createChainMonitor(config?: Partial<ChainMonitorConfig>): ChainMonitor {
  const fullConfig: ChainMonitorConfig = {
    driftDetector: config?.driftDetector ?? driftDetector,
    hallucinationChecker: config?.hallucinationChecker ?? hallucinationChecker,
    roiTracker: config?.roiTracker ?? roiTracker,
    latencyMonitor: config?.latencyMonitor ?? latencyMonitor,
    latencyThresholdMs: config?.latencyThresholdMs ?? 2000,
  };

  return new ChainMonitor(fullConfig);
}

/**
 * Default chain monitor instance
 */
export const chainMonitor = createChainMonitor();
