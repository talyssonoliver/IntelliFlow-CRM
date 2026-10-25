/**
 * AI-metrics OTel facade (IFC-117, ADR-088).
 *
 * The only code that creates AI-metric instruments or attribute objects. Instruments come from
 * the global MeterProvider that ai-worker's NodeSDK registers (tracing/otel.ts), so they ride the
 * existing OTLP export to Grafana Cloud — never packages/observability's initMetrics(), which
 * would register a second (gRPC) provider.
 *
 * Every attribute value is mapped onto a closed set (unknown → `other`), so no tenant, lead,
 * operation id, error text or model output can ever become a metric label. Recorders never
 * throw: a metrics failure must not change a chain's result.
 *
 * @module otel-ai-metrics
 * @task IFC-117
 */
import {
  metrics,
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  type ObservableGauge,
  type ObservableResult,
} from '@opentelemetry/api';
import pino from 'pino';
import { MODEL_PRICING, servedPricingKey } from '../config/ai.config';
import {
  AI_METRIC_DEFINITIONS,
  CHAIN_IDS,
  DRIFT_METRICS,
  DRIFT_SEVERITIES,
  DRIFT_STATUSES,
  HALLUCINATION_SKIP_REASONS,
  HALLUCINATION_TYPES,
  OUTCOMES,
  URGENCIES,
  VALUE_TYPES,
  type ChainId,
  type DriftTickResult,
  type ErrorClass,
  type HallucinationOutcome,
  type Outcome,
} from './otel-ai-types';

export { AI_ALERT_THRESHOLDS, AI_METRIC_DEFINITIONS } from './otel-ai-types';

const logger = pino({ name: 'otel-ai-metrics', level: process.env.LOG_LEVEL || 'info' });

const METER_NAME = 'intelliflow-ai-worker-monitoring';
const OTHER = 'other';
const LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000, 30000];
const CONFIDENCE_BUCKETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
/** Drift severities the alert rule matches; pre-seeded so the first onset is not lost to increase(). */
const SEEDED_DRIFT_SEVERITIES = ['high', 'critical'] as const;

interface Instruments {
  latency: Histogram;
  count: Counter;
  confidence: Histogram;
  cost: Counter;
  value: Counter;
  hallucinationChecks: Counter;
  hallucinationDetected: Counter;
  hallucinationTypes: Counter;
  hallucinationSkipped: Counter;
  driftDetections: Counter;
  driftChecks: Counter;
  retrainingTriggers: Counter;
}

let testMeter: Meter | null = null;
let instruments: Instruments | null = null;
let removeGaugeCallbacks: (() => void) | null = null;
let seeded = false;
const driftScores = new Map<string, { model: string; metric: string; score: number }>();
let lastCheckSeconds: number | null = null;

function meter(): Meter {
  return testMeter ?? metrics.getMeter(METER_NAME);
}

function definition(name: string) {
  const found = AI_METRIC_DEFINITIONS.find((d) => d.name === name);
  if (!found) throw new Error(`unknown AI metric ${name}`);
  return { unit: found.unit, description: found.description };
}

function createGauge(m: Meter, name: string): ObservableGauge {
  return m.createObservableGauge(name, definition(name));
}

function getInstruments(): Instruments {
  if (instruments) return instruments;
  const m = meter();
  const counter = (name: string): Counter => m.createCounter(name, definition(name));
  const created: Instruments = {
    latency: m.createHistogram('intelliflow.ai.inference.latency', {
      ...definition('intelliflow.ai.inference.latency'),
      advice: { explicitBucketBoundaries: LATENCY_BUCKETS_MS },
    }),
    count: counter('intelliflow.ai.inference.count'),
    confidence: m.createHistogram('intelliflow.ai.confidence', {
      ...definition('intelliflow.ai.confidence'),
      advice: { explicitBucketBoundaries: CONFIDENCE_BUCKETS },
    }),
    cost: counter('intelliflow.ai.cost.usd'),
    value: counter('intelliflow.ai.value.estimated.usd'),
    hallucinationChecks: counter('intelliflow.ai.hallucination.checks'),
    hallucinationDetected: counter('intelliflow.ai.hallucination.detected'),
    hallucinationTypes: counter('intelliflow.ai.hallucination.types'),
    hallucinationSkipped: counter('intelliflow.ai.hallucination.skipped'),
    driftDetections: counter('intelliflow.ai.drift.detections'),
    driftChecks: counter('intelliflow.ai.drift.checks'),
    retrainingTriggers: counter('intelliflow.ai.retraining.triggers'),
  };

  const scoreGauge = createGauge(m, 'intelliflow.ai.drift.score');
  const lastCheckGauge = createGauge(m, 'intelliflow.ai.drift.last_check');
  // Callbacks read the snapshot cached at the last tick: synchronous, O(series), never throwing.
  const observeScores = (result: ObservableResult): void => {
    try {
      for (const s of driftScores.values())
        result.observe(s.score, { model: s.model, metric: s.metric });
    } catch (err) {
      logger.debug({ err: errorName(err) }, 'drift score gauge callback failed');
    }
  };
  const observeLastCheck = (result: ObservableResult): void => {
    try {
      if (lastCheckSeconds !== null) result.observe(lastCheckSeconds);
    } catch (err) {
      logger.debug({ err: errorName(err) }, 'drift last-check gauge callback failed');
    }
  };
  scoreGauge.addCallback(observeScores);
  lastCheckGauge.addCallback(observeLastCheck);
  removeGaugeCallbacks = () => {
    scoreGauge.removeCallback(observeScores);
    lastCheckGauge.removeCallback(observeLastCheck);
  };

  instruments = created;
  return created;
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** Run a recording step; a metrics failure is logged at debug and never reaches the caller. */
function safely(step: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    logger.debug({ step, err: errorName(err) }, 'AI metric recording failed');
  }
}

function oneOf<T extends string>(
  allowed: readonly T[],
  raw: unknown,
  fallback: string = OTHER
): T | string {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? raw : fallback;
}

function chainAttr(raw: unknown): ChainId {
  return oneOf(CHAIN_IDS, raw, 'unknown') as ChainId;
}

/**
 * Map a model name onto a MODEL_PRICING key (directly, or via the served-model table for dated
 * gateway names); anything else — `default`, `unknown`, `:free` variants, prototype keys — is `other`.
 */
export function normalizeModel(raw: unknown): string {
  if (typeof raw !== 'string') return OTHER;
  const name = raw.trim();
  if (name && Object.hasOwn(MODEL_PRICING, name)) return name;
  const served = servedPricingKey(name);
  return served && Object.hasOwn(MODEL_PRICING, served) ? served : OTHER;
}

/** Classify an error without ever passing its name or message through. */
export function classifyError(err: unknown): ErrorClass {
  if (!err || typeof err !== 'object') return 'other';
  const e = err as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
  };
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const status = typeof e.status === 'number' ? e.status : e.statusCode;
  if (status === 429 || /rate.?limit/i.test(name)) return 'rate_limited';
  if (/timeout|abort/i.test(name) || e.code === 'ETIMEDOUT' || /\btimed out\b/i.test(message))
    return 'timeout';
  if (name === 'ZodError' || name === 'SyntaxError' || /pars(e|ing)/i.test(name)) return 'parse';
  return 'other';
}

function knownModels(): string[] {
  return Object.keys(MODEL_PRICING);
}

/** Number of series registerAiMetrics() pre-seeds (used by the cardinality test). */
export function seededSeriesBound(): number {
  const known = knownModels().length;
  const models = known + 1; // + other
  const chains = CHAIN_IDS.length;
  return (
    models * chains + // inference.count (outcome=success)
    models * chains * 2 + // hallucination.checks + hallucination.detected
    models * DRIFT_METRICS.length * SEEDED_DRIFT_SEVERITIES.length + // drift.detections
    DRIFT_STATUSES.length + // drift.checks
    known * chains // cost.usd (known models only: unknown models never record cost)
  );
}

/**
 * Create the instruments and gauges and pre-seed the closed label sets with 0, so ratios and
 * increase() have a zero point before the first real event. Idempotent; called at worker boot.
 */
export function registerAiMetrics(): void {
  safely('register', () => {
    const i = getInstruments();
    if (seeded) return;
    const models = [...knownModels(), OTHER];
    for (const model of models) {
      for (const chain of CHAIN_IDS) {
        i.count.add(0, { model, chain, outcome: 'success' });
        i.hallucinationChecks.add(0, { model, chain });
        i.hallucinationDetected.add(0, { model, chain });
        if (model !== OTHER) i.cost.add(0, { model, chain });
      }
      for (const metric of DRIFT_METRICS) {
        for (const severity of SEEDED_DRIFT_SEVERITIES)
          i.driftDetections.add(0, { model, metric, severity });
      }
    }
    for (const status of DRIFT_STATUSES) i.driftChecks.add(0, { status });
    seeded = true;
  });
}

export function recordInference(input: {
  model?: string;
  chain: ChainId;
  outcome: Outcome;
  latencyMs: number;
  error?: unknown;
}): void {
  safely('inference', () => {
    const i = getInstruments();
    const outcome = oneOf(OUTCOMES, input.outcome);
    const attrs: Attributes = {
      model: normalizeModel(input.model),
      chain: chainAttr(input.chain),
      outcome,
    };
    i.count.add(
      1,
      outcome === 'error' ? { ...attrs, error_class: classifyError(input.error) } : attrs
    );
    if (Number.isFinite(input.latencyMs) && input.latencyMs >= 0)
      i.latency.record(input.latencyMs, attrs);
  });
}

export function recordConfidence(input: {
  model?: string;
  chain: ChainId;
  confidence: unknown;
}): void {
  safely('confidence', () => {
    const c = input.confidence;
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) return;
    getInstruments().confidence.record(c, {
      model: normalizeModel(input.model),
      chain: chainAttr(input.chain),
    });
  });
}

/** Cost in USD; recorded only for a known pricing key (calculateCost invents a price otherwise). */
export function recordCost(input: { model?: string; chain: ChainId; usd: number }): void {
  safely('cost', () => {
    const model = normalizeModel(input.model);
    if (model === OTHER || !Number.isFinite(input.usd) || input.usd < 0) return;
    getInstruments().cost.add(input.usd, { model, chain: chainAttr(input.chain) });
  });
}

/** Estimated value in USD (a configured estimate per outcome, not a measured result). */
export function recordEstimatedValue(input: {
  chain: ChainId;
  valueType: string;
  usd: number;
}): void {
  safely('value', () => {
    if (!Number.isFinite(input.usd) || input.usd <= 0) return;
    getInstruments().value.add(input.usd, {
      chain: chainAttr(input.chain),
      value_type: oneOf(VALUE_TYPES, input.valueType),
    });
  });
}

export function recordHallucination(input: {
  model?: string;
  chain: ChainId;
  outcome: HallucinationOutcome;
}): void {
  safely('hallucination', () => {
    const i = getInstruments();
    const chain = chainAttr(input.chain);
    const { outcome } = input;
    if (outcome.status !== 'checked') {
      const reason = outcome.status === 'error' ? 'error' : outcome.reason;
      i.hallucinationSkipped.add(1, { chain, reason: oneOf(HALLUCINATION_SKIP_REASONS, reason) });
      return;
    }
    const attrs = { model: normalizeModel(input.model), chain };
    i.hallucinationChecks.add(1, attrs);
    if (!outcome.hallucinated) return;
    i.hallucinationDetected.add(1, attrs);
    for (const type of new Set(outcome.types)) {
      i.hallucinationTypes.add(1, {
        ...attrs,
        hallucination_type: oneOf(HALLUCINATION_TYPES, type),
      });
    }
  });
}

/** One scheduled drift tick: checks per status, detections once per event onset, gauge snapshot. */
export function recordDriftTick(results: readonly DriftTickResult[]): void {
  safely('drift', () => {
    const i = getInstruments();
    for (const r of results) {
      const model = normalizeModel(r.model);
      const metric = oneOf(DRIFT_METRICS, r.metric);
      i.driftChecks.add(1, { status: oneOf(DRIFT_STATUSES, r.status) });
      if (r.onset)
        i.driftDetections.add(1, { model, metric, severity: oneOf(DRIFT_SEVERITIES, r.severity) });
      if (r.status === 'evaluated' && Number.isFinite(r.driftScore)) {
        driftScores.set(`${model}|${metric}`, { model, metric, score: r.driftScore });
      }
    }
    lastCheckSeconds = Math.floor(Date.now() / 1000);
  });
}

export function recordRetrainingTrigger(input: { urgency: string }): void {
  safely('retraining', () => {
    getInstruments().retrainingTriggers.add(1, { urgency: oneOf(URGENCIES, input.urgency) });
  });
}

/** Test seam: record through `m` instead of the global meter (null restores the global). */
export function __setMeterForTests(m: Meter | null): void {
  __resetAiMetricsForTests();
  testMeter = m;
}

/** Test seam: drop memoized instruments, gauge callbacks and the drift snapshot. */
export function __resetAiMetricsForTests(): void {
  try {
    removeGaugeCallbacks?.();
  } catch {
    // a test meter may already be shut down
  }
  removeGaugeCallbacks = null;
  instruments = null;
  seeded = false;
  driftScores.clear();
  lastCheckSeconds = null;
}
