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
import { calculateCost } from '../config/ai.config';

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
 * Token usage captured from an LLM invocation
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Optional caller-supplied context for richer monitoring payloads.
 * All fields are optional — omitting the context preserves backward-compatible behaviour.
 */
export interface MonitoringContext {
  /** Logical model name used for cost calculation and metric labels, e.g. 'scoring-free' */
  modelName?: string;
  /** Returns captured token usage after fn() resolves; return null when unavailable */
  getUsage?: () => TokenUsage | null;
  /** Extracts a text string from the result for hallucination checking; return null to skip */
  extractText?: (result: unknown) => string | null;
  /**
   * Sanitized input context for hallucination checking (e.g. the lead info sent to the LLM).
   * Omit when not available — skips context-dependent hallucination checks.
   */
  inputContext?: string;
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
    fn: (...args: Args) => Promise<T>,
    context?: MonitoringContext
  ): (...args: Args) => Promise<MonitoredResult<T>> {
    return async (...args: Args): Promise<MonitoredResult<T>> => {
      return withMonitoring(() => fn(...args), this.config, context);
    };
  }
}

/**
 * Compute token cost and record it on the ROI tracker using the same computed value
 * so metrics.tokenCost and the stored cost never diverge (AC-001, AC-004).
 * Returns 0 when usage is unavailable.
 */
function computeTokenCost(
  operationId: string,
  config: ChainMonitorConfig,
  context: MonitoringContext | undefined
): number {
  const usage = context?.getUsage?.() ?? null;
  if (usage === null) return 0;
  // Prefer the caller-supplied modelName; fall back to usage.model so the pricing key is
  // never silently lost when context.modelName is omitted (AC-004).
  const modelName = context?.modelName ?? usage.model ?? 'unknown';
  const cost = calculateCost(modelName, usage.inputTokens, usage.outputTokens);
  if (cost > 0) {
    // Pass the pre-computed cost so ROI tracker and metrics.tokenCost use the same value.
    config.roiTracker.recordCost({
      id: operationId,
      model: modelName,
      operationType: 'chain_execution',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost,
    });
  }
  return cost;
}

/**
 * Run the hallucination checker and return type labels.
 * Falls back to [] on any error so chain errors are never suppressed (AC-002, AC-003, AC-007, AC-008).
 * Raw output text is NEVER logged (AC-008 / PII safety).
 *
 * NOTE: We require a non-empty inputContext before calling checkOutput. Passing an empty
 * context string causes HallucinationChecker to flag ALL extracted claims as
 * unsupported_claim and ALL topic overlaps as context_drift — producing false positives.
 * When context is unavailable, we return [] rather than emit misleading flags (AC-003).
 */
async function computeHallucinationFlags<T>(
  operationId: string,
  result: T,
  config: ChainMonitorConfig,
  context: MonitoringContext | undefined
): Promise<string[]> {
  if (!context?.extractText) return [];
  const inputContext = context.inputContext;
  if (!inputContext || inputContext.trim().length === 0) return []; // skip context-dependent checks
  try {
    const outputText = context.extractText(result);
    if (!outputText || outputText.length < 10) return [];
    const hallucinationResult = await config.hallucinationChecker.checkOutput({
      id: operationId,
      model: context.modelName ?? 'unknown',
      inputContext, // non-empty: caller supplies sanitized context (AC-008 — raw PII never logged)
      output: outputText, // NEVER logged — only hallucinationTypes are emitted below
    });
    return hallucinationResult.hallucinationTypes as string[];
  } catch (err) {
    logger.warn(
      { operationId, error: err instanceof Error ? err.message : String(err) },
      'Hallucination check failed — falling back to empty flags'
    );
    return [];
  }
}

/**
 * Execute a function with comprehensive monitoring
 */
export async function withMonitoring<T>(
  fn: () => Promise<T>,
  config: ChainMonitorConfig,
  context?: MonitoringContext
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
      model: context?.modelName ?? 'default',
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
        model: context?.modelName ?? 'default',
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

    // Compute real token cost and hallucination flags via extracted helpers
    const tokenCost = computeTokenCost(operationId, config, context);
    const hallucinationFlags = await computeHallucinationFlags(
      operationId,
      result,
      config,
      context
    );

    // Build metrics
    const metrics = {
      operationId,
      latencyMs,
      tokenCost,
      driftScore,
      hallucinationFlags,
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
      model: context?.modelName ?? 'default',
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
