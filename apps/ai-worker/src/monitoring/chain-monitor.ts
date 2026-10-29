/**
 * Chain Monitor - Unified AI Monitoring Orchestrator
 *
 * Wraps AI chain execution with comprehensive monitoring:
 * - Drift detection (via DriftDetector)
 * - Hallucination checking (via HallucinationChecker)
 * - ROI tracking (via ROITracker)
 * - Latency monitoring (via LatencyMonitor)
 *
 * IFC-117: withMonitoring is also the single counting point for the OTel AI metrics
 * (otel-ai-metrics.ts), so they come from the real chain path and ride the OTLP export.
 *
 * @module chain-monitor
 * @task IFC-117
 */

import pino from 'pino';
import { DriftDetector, driftDetector } from './drift-detector';
import { HallucinationChecker, hallucinationChecker } from './hallucination-checker';
import { ROITracker, roiTracker, type ValueType } from './roi-tracker';
import { LatencyMonitor, latencyMonitor } from './latency-monitor';
import { calculateCost } from '../config/ai.config';
import {
  recordConfidence,
  classifyError,
  recordCost,
  recordEstimatedValue,
  recordHallucination,
  recordInference,
} from './otel-ai-metrics';
import type { ChainId, HallucinationOutcome } from './otel-ai-types';

const logger = pino({
  name: 'chain-monitor',
  level: process.env.LOG_LEVEL || 'info',
});

/** Shortest extracted text the hallucination checker is run on. */
const MIN_CHECKED_TEXT_LENGTH = 10;

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
  /** A MODEL_PRICING key or the caller's alias: a bounded value, never a raw served name. */
  model: string;
  /** The model that served the call costs nothing (an OpenRouter `:free` model, local Ollama). */
  free?: boolean;
}

/**
 * Optional caller-supplied context for richer monitoring payloads.
 * All fields are optional — omitting the context preserves backward-compatible behaviour,
 * except that no value is booked without an explicit `valueType` (IFC-117).
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
  /** Which chain this is, for metric labels (IFC-117). */
  chain?: ChainId;
  /** The value booked on success; nothing is booked without it (IFC-117). */
  valueType?: ValueType;
  /** false for a job-level fallback-provider call, so a provider switch is not read as drift. */
  recordDrift?: boolean;
  /**
   * false when the result's confidence is a placeholder the chain set because the model did not
   * report one. It is then neither a confidence measurement nor a drift sample.
   */
  confidenceReported?: (result: unknown) => boolean;
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
    /** Checker verdict, or null when the check was skipped or failed. */
    hallucinated: boolean | null;
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
 * Returns null when no usage was captured (distinct from a legitimately free call, 0).
 */
function computeTokenCost(
  operationId: string,
  config: ChainMonitorConfig,
  context: MonitoringContext | undefined
): { cost: number; model: string } | null {
  const usage = context?.getUsage?.() ?? null;
  if (usage === null) return null;
  // Price what served the call (IFC-117): usage.model is the served model's pricing key when it
  // is known, else the caller's alias; context.modelName only covers usage without a model.
  const modelName = usage.model || context?.modelName || 'unknown';
  const cost = usage.free ? 0 : calculateCost(modelName, usage.inputTokens, usage.outputTokens);
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
  return { cost, model: modelName };
}

/**
 * Run the hallucination checker and report what happened.
 * Never throws, so chain errors are never suppressed (AC-002, AC-003, AC-007, AC-008).
 * Raw output text is NEVER logged (AC-008 / PII safety).
 *
 * NOTE: We require a non-empty inputContext before calling checkOutput. Passing an empty
 * context string causes HallucinationChecker to flag ALL extracted claims as
 * unsupported_claim and ALL topic overlaps as context_drift — producing false positives.
 * When context is unavailable, the check is skipped rather than emitting misleading flags.
 */
async function checkHallucination<T>(
  operationId: string,
  result: T,
  config: ChainMonitorConfig,
  context: MonitoringContext | undefined
): Promise<HallucinationOutcome> {
  const inputContext = context?.inputContext;
  if (!inputContext || inputContext.trim().length === 0)
    return { status: 'skipped', reason: 'no_context' };
  if (!context?.extractText) return { status: 'skipped', reason: 'no_text' };
  try {
    const outputText = context.extractText(result);
    if (!outputText) return { status: 'skipped', reason: 'no_text' };
    if (outputText.length < MIN_CHECKED_TEXT_LENGTH)
      return { status: 'skipped', reason: 'too_short' };
    const checked = await config.hallucinationChecker.checkOutput({
      id: operationId,
      model: context.modelName ?? 'unknown',
      inputContext, // non-empty: caller supplies sanitized context (AC-008 — raw PII never logged)
      output: outputText, // NEVER logged — only hallucinationTypes are emitted below
    });
    return {
      status: 'checked',
      hallucinated: checked.hallucinated,
      types: checked.hallucinationTypes,
    };
  } catch (err) {
    logger.warn(
      { operationId, error: err instanceof Error ? err.message : String(err) },
      'Hallucination check failed — falling back to empty flags'
    );
    return { status: 'error' };
  }
}

/** A finite number in [0, 1], or null. */
function unitInterval(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

/**
 * Record the result's output distributions for drift: the lead score (0-100, normalised by
 * dividing by 100) and the model-reported confidence. Returns the normalised score.
 */
function recordDriftSamples<T>(
  result: T,
  config: ChainMonitorConfig,
  model: string,
  confidenceReported = true
): number | null {
  if (!result || typeof result !== 'object') return null;
  const timestamp = new Date();
  let driftScore: number | null = null;

  if ('score' in result) {
    const score = (result as { score: unknown }).score;
    if (typeof score === 'number' && Number.isFinite(score)) {
      driftScore = score / 100;
      config.driftDetector.recordSample({
        value: driftScore,
        timestamp,
        model,
        metric: 'score_distribution',
      });
    }
  }
  const confidence =
    confidenceReported && 'confidence' in result
      ? unitInterval((result as { confidence: unknown }).confidence)
      : null;
  if (confidence !== null) {
    config.driftDetector.recordSample({
      value: confidence,
      timestamp,
      model,
      metric: 'confidence_level',
    });
  }
  return driftScore;
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
  const model = context?.modelName ?? 'default';
  const chain: ChainId = context?.chain ?? 'unknown';

  // Start latency tracking
  config.latencyMonitor.startOperation(operationId);

  let result: T;
  let errorType: string | undefined;

  // Spend is recorded exactly once per invocation, on success or failure: a paid call can still
  // fail (e.g. structured-output parsing after handleLLMEnd captured the usage). The flag is set
  // before recording, so a throw inside it can neither double-count nor change the outcome.
  let spendRecorded = false;
  let tokenCost: { cost: number; model: string } | null = null;
  const recordSpendOnce = (): { cost: number; model: string } | null => {
    if (spendRecorded) return tokenCost;
    spendRecorded = true;
    try {
      tokenCost = computeTokenCost(operationId, config, context);
      if (tokenCost !== null) recordCost({ model: tokenCost.model, chain, usd: tokenCost.cost });
    } catch (costError) {
      logger.error(
        {
          operationId,
          // The class only: a usage or provider error can echo prompt or lead text (NF-002).
          errorClass: classifyError(costError),
        },
        'Recording AI spend failed'
      );
    }
    return tokenCost;
  };

  try {
    // Execute the wrapped function
    result = await fn();

    // Record successful completion
    const latencyMs = Date.now() - startTime;

    config.latencyMonitor.completeOperation(operationId, {
      model,
      operationType: 'chain_execution',
      success: true,
    });
    recordInference({ model, chain, outcome: 'success', latencyMs });

    const rawConfidence =
      result && typeof result === 'object' && 'confidence' in result
        ? (result as { confidence: unknown }).confidence
        : undefined;
    const confidenceReported = context?.confidenceReported?.(result) ?? true;
    if (confidenceReported) recordConfidence({ model, chain, confidence: rawConfidence });

    // Record drift samples (score and confidence distributions)
    const driftScore =
      context?.recordDrift === false
        ? null
        : recordDriftSamples(result, config, model, confidenceReported);

    // Record ROI value only for an explicit value type (IFC-117: no blanket lead_scored)
    if (context?.valueType) {
      const booked = config.roiTracker.recordValueByType({
        id: operationId,
        valueType: context.valueType,
        relatedCostIds: [operationId],
      });
      recordEstimatedValue({ chain, valueType: booked.valueType, usd: booked.estimatedValue });
    } else {
      logger.debug({ operationId, chain }, 'No valueType in monitoring context; no value booked');
    }

    // Compute real token cost and the hallucination outcome via extracted helpers
    const spend = recordSpendOnce();

    const hallucination = await checkHallucination(operationId, result, config, context);
    recordHallucination({ model, chain, outcome: hallucination });

    // Build metrics
    const metrics = {
      operationId,
      latencyMs,
      tokenCost: spend?.cost ?? 0,
      driftScore,
      hallucinationFlags: hallucination.status === 'checked' ? [...hallucination.types] : [],
      hallucinated: hallucination.status === 'checked' ? hallucination.hallucinated : null,
      confidenceScore: typeof rawConfidence === 'number' ? rawConfidence : 1,
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
      model,
      operationType: 'chain_execution',
      success: false,
      errorType,
    });
    recordInference({ model, chain, outcome: 'error', latencyMs: Date.now() - startTime, error });

    logger.error(
      {
        operationId,
        errorType,
        error: error instanceof Error ? error.message : String(error),
      },
      'Chain execution failed'
    );

    throw error;
  } finally {
    recordSpendOnce();
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
