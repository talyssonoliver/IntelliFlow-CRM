/**
 * Shared contract for the AI-metrics OTel facade (IFC-117, ADR-088).
 *
 * No runtime imports: only `import type` and literal constants, so the facade, chain-monitor,
 * drift-detector and the tools-side tests can all depend on this file without a cycle.
 *
 * @module otel-ai-types
 * @task IFC-117
 */
import type { HallucinationType } from './hallucination-checker';
import type { ValueType } from './roi-tracker';

/** Which wrapped chain a call came from. Only lead scoring has a production caller today. */
export const CHAIN_IDS = ['lead_scoring', 'auto_response', 'unknown'] as const;
export type ChainId = (typeof CHAIN_IDS)[number];

export const OUTCOMES = ['success', 'error'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Derived from the error, never the raw error name or message. */
export const ERROR_CLASSES = ['timeout', 'rate_limited', 'parse', 'other'] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

export const HALLUCINATION_TYPES = [
  'factual_error',
  'fabricated_entity',
  'inconsistent_logic',
  'unsupported_claim',
  'temporal_error',
  'numerical_error',
  'attribution_error',
  'context_drift',
] as const satisfies readonly HallucinationType[];

export const VALUE_TYPES = [
  'lead_scored',
  'lead_qualified',
  'email_generated',
  'response_automated',
  'insight_generated',
  'document_processed',
  'task_automated',
  'prediction_made',
  'recommendation_made',
  'feedback_positive',
  'feedback_negative',
  'feedback_correction',
] as const satisfies readonly ValueType[];

/**
 * Compile-time exhaustiveness: adding a member to HallucinationType or ValueType without listing
 * it above fails the build instead of silently mapping the new value to `other`.
 */
export const HALLUCINATION_TYPES_EXHAUSTIVE: [
  Exclude<HallucinationType, (typeof HALLUCINATION_TYPES)[number]>,
] extends [never]
  ? true
  : never = true;
export const VALUE_TYPES_EXHAUSTIVE: [Exclude<ValueType, (typeof VALUE_TYPES)[number]>] extends [
  never,
]
  ? true
  : never = true;

export const URGENCIES = ['none', 'low', 'medium', 'high', 'critical'] as const;

/** The only drift metrics the scheduler evaluates: both bounded to [0, 1]. */
export const DRIFT_METRICS = ['score_distribution', 'confidence_level'] as const;
export type ScheduledDriftMetric = (typeof DRIFT_METRICS)[number];

export const DRIFT_SEVERITIES = ['none', 'low', 'medium', 'high', 'critical'] as const;
export type DriftSeverity = (typeof DRIFT_SEVERITIES)[number];

export const DRIFT_STATUSES = ['evaluated', 'insufficient_data'] as const;
export type DriftStatus = (typeof DRIFT_STATUSES)[number];

export const HALLUCINATION_SKIP_REASONS = ['no_context', 'no_text', 'too_short', 'error'] as const;
export type HallucinationSkipReason = (typeof HALLUCINATION_SKIP_REASONS)[number];

/** Every attribute key the facade may emit. Nothing else ever becomes a metric label. */
export const ATTRIBUTE_KEYS = [
  'model',
  'chain',
  'outcome',
  'error_class',
  'hallucination_type',
  'value_type',
  'urgency',
  'metric',
  'severity',
  'status',
  'reason',
] as const;

/** Result of one hallucination check at the withMonitoring call site. */
export type HallucinationOutcome =
  | { status: 'skipped'; reason: Exclude<HallucinationSkipReason, 'error'> }
  | { status: 'error' }
  | { status: 'checked'; hallucinated: boolean; types: readonly HallucinationType[] };

/** What one scheduled drift tick reports per (model, metric). */
export interface DriftTickResult {
  model: string;
  metric: string;
  status: DriftStatus;
  /** This tick passed the significance + effect-size gate. */
  detectedTick: boolean;
  /** This tick started a drift event (third consecutive detected tick). */
  onset: boolean;
  /** A drift event is open after this tick. */
  inEvent: boolean;
  /** This tick raised an already-open event to a higher severity than it had reached. */
  escalated?: boolean;
  severity: DriftSeverity;
  driftScore: number;
  pValue: number;
}

/** Alert thresholds shared by code, the AI rules file and its tests (NF-007). */
export const AI_ALERT_THRESHOLDS = {
  hallucinationRate: 0.05,
  minHallucinationChecks: 20,
  latencyP95Ms: 2000,
  errorRatio: 0.05,
  minCalls: 10,
} as const;

export interface AiMetricDefinition {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  unit: string;
  description: string;
}

const METRIC_TYPES: readonly AiMetricDefinition['type'][] = ['counter', 'histogram', 'gauge'];

/** Parse one `name | type | unit | description` row of the instrument table (the unit may be empty). */
export function parseAiMetricRow(row: string): AiMetricDefinition {
  const fields = row.split('|').map((field) => field.trim());
  const [name, type, unit, description] = fields;
  const known = METRIC_TYPES.find((t) => t === type);
  if (fields.length !== 4 || !name || !known || !description) {
    throw new Error(`Malformed AI metric row: ${row}`);
  }
  return { name, type: known, unit, description };
}

/**
 * Every instrument the facade registers, one `name | type | unit | description` row each. The
 * tools-side asset check cross-references this list.
 */
export const AI_METRIC_DEFINITIONS: readonly AiMetricDefinition[] = [
  'intelliflow.ai.inference.latency | histogram | ms | Wall time of a monitored AI chain call',
  'intelliflow.ai.inference.count | counter | 1 | Monitored AI chain calls by outcome',
  'intelliflow.ai.confidence | histogram |  | Model-reported confidence (0-1) of successful calls',
  'intelliflow.ai.cost.usd | counter |  | Token cost of AI calls in USD',
  'intelliflow.ai.value.estimated.usd | counter |  | Estimated value booked for AI outcomes in USD (configured estimate, not a measured outcome)',
  'intelliflow.ai.hallucination.checks | counter | 1 | Outputs run through the heuristic hallucination checker',
  'intelliflow.ai.hallucination.detected | counter | 1 | Outputs the heuristic checker flagged as hallucinated',
  'intelliflow.ai.hallucination.types | counter | 1 | Hallucination types on flagged outputs',
  'intelliflow.ai.hallucination.skipped | counter | 1 | Hallucination checks skipped, by reason',
  'intelliflow.ai.drift.score | gauge |  | Latest output-distribution shift score (display only)',
  'intelliflow.ai.drift.detections | counter | 1 | Output-distribution shift events (counted at onset and again on each severity escalation)',
  'intelliflow.ai.drift.checks | counter | 1 | Scheduled drift evaluations, by status',
  'intelliflow.ai.drift.last_check | gauge |  | Epoch seconds of the last scheduled drift tick',
  'intelliflow.ai.retraining.triggers | counter | 1 | Retraining threshold breaches from the feedback-analytics job',
].map(parseAiMetricRow);
