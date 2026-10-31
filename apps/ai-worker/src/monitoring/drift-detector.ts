/**
 * AI Model Drift Detector
 * Monitors AI model outputs for distribution shifts (lead mix or model).
 *
 * IFC-117 (ADR-088): detection runs on a schedule (drift-scheduler.ts) against a
 * time-of-day-matched reference — the same window on each of the previous days — using shared
 * bin edges, bias-corrected PSI and a tie-aware two-sample KS test with the real sample sizes.
 * A drift EVENT starts only after three consecutive detected ticks and ends after three clear
 * ones, so a single noisy window never alerts.
 *
 * @module drift-detector
 * @task IFC-117
 */

import { randomInt } from 'node:crypto';
import pino from 'pino';
import {
  binCounts,
  compositeScore,
  excessPsi,
  fixedEdges,
  isDetectedTick,
  ksFromCounts,
  ksTwoSample,
  severityFrom,
  type Severity,
} from './drift-stats';
import type { DriftStatus, DriftTickResult } from './otel-ai-types';

const logger = pino({
  name: 'drift-detector',
  level: process.env.LOG_LEVEL || 'info',
});

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Consecutive detected (or clear) ticks needed to open (or close) a drift event. */
const PERSISTENCE_TICKS = 3;
/** Metrics whose values live in [0, 1], so fixed [0, 1] bin edges are always right. */
const BOUNDED_METRICS = new Set(['score_distribution', 'confidence_level', 'user_satisfaction']);

/**
 * Statistical window for drift detection
 */
export interface DriftWindow {
  startTime: Date;
  endTime: Date;
  sampleCount: number;
  mean: number;
  variance: number;
  min: number;
  max: number;
  distribution: number[];
  /** The `distribution.length + 1` edges it was binned on, so a pinned window keeps its bins. */
  binEdges?: number[];
}

/**
 * Drift detection result. Structurally a DriftTickResult, plus the windows for the in-app tier.
 */
export interface DriftResult extends DriftTickResult {
  /** Same as detectedTick; kept for the persisted drift events and in-app consumers. */
  detected: boolean;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** Highest severity the open event has reached after this tick; 'none' outside an event. */
  eventSeverity?: Severity;
  baselineWindow: DriftWindow;
  currentWindow: DriftWindow;
  timestamp: Date;
  recommendations: string[];
}

/**
 * Configuration for drift detection
 */
export interface DriftDetectorConfig {
  windowSizeHours: number;
  slidingIntervalMinutes: number;
  pValueThreshold: number;
  /** Minimum reference samples; the current window needs half of this. */
  minSamplesRequired: number;
  /** Days of time-of-day-matched reference slices to pool. */
  referenceDays: number;
  /** How long samples are kept (must exceed referenceDays + window). */
  retentionDays: number;
  /**
   * Most samples kept per (model, metric). Split evenly over the UTC days a retention window
   * touches (retentionDays + 1), each day reservoir-sampled, so one busy day never evicts the
   * previous days' reference.
   */
  maxSamplesPerKey: number;
  /** Most (model, metric) series kept; samples for a new key past the cap are dropped. */
  maxSeries: number;
  binCount: number;
}

/**
 * Sample data point for drift analysis
 */
export interface DriftSample {
  value: number;
  timestamp: Date;
  model: string;
  metric: string;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
}

/**
 * Model performance metrics tracked for drift
 */
export type DriftMetricType =
  | 'score_distribution'
  | 'confidence_level'
  | 'latency'
  | 'token_usage'
  | 'error_rate'
  | 'output_length'
  | 'user_correction_error' // IFC-024: Human feedback
  | 'user_satisfaction'; // IFC-024: Human feedback

/**
 * Human feedback data for drift signals (IFC-024)
 */
export interface FeedbackDriftSignal {
  originalScore: number;
  correctedScore?: number;
  feedbackType: 'THUMBS_UP' | 'THUMBS_DOWN' | 'SCORE_CORRECTION';
  modelVersion: string;
}

/** One UTC day of a series: a uniform reservoir of the `seen` samples recorded that day. */
interface DayBucket {
  samples: DriftSample[];
  seen: number;
}

interface SeriesEntry {
  model: string;
  metric: string;
  days: Map<number, DayBucket>;
}

function utcDay(timestamp: Date): number {
  return Math.floor(timestamp.getTime() / DAY_MS);
}

function allSamples(entry: SeriesEntry | undefined): DriftSample[] {
  return entry ? [...entry.days.values()].flatMap((bucket) => bucket.samples) : [];
}

interface PersistenceState {
  consecutiveDetected: number;
  consecutiveClear: number;
  inEvent: boolean;
  /** Highest severity the open event has reached; 'none' outside an event. */
  peakSeverity: Severity;
}

const SEVERITY_ORDER: readonly Severity[] = ['none', 'low', 'medium', 'high', 'critical'];

function isHighSeverity(severity: Severity): boolean {
  return severity === 'high' || severity === 'critical';
}

/** Clock skew allowed on a sample's timestamp; a later one would open a day bucket never pruned. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function seriesKey(model: string, metric: string): string {
  return JSON.stringify([model, metric]);
}

/**
 * Drift Detector Service
 */
export class DriftDetector {
  private readonly series: Map<string, SeriesEntry> = new Map();
  private readonly baselines: Map<string, DriftWindow> = new Map();
  private readonly persistence: Map<string, PersistenceState> = new Map();
  private driftHistory: DriftResult[] = [];
  private lastTickAt: Date | null = null;
  private readonly warned = new Set<'series_cap' | 'out_of_window' | 'non_finite_value'>();

  /**
   * @param randomIndex Uniform integer in [0, n) for reservoir sampling; injectable for tests.
   */
  constructor(
    private readonly config: DriftDetectorConfig,
    private readonly randomIndex: (n: number) => number = randomInt
  ) {
    logger.info({ config }, 'DriftDetector initialized');
  }

  /** Samples kept per UTC day: a retention window touches retentionDays + 1 of them. */
  private perDayCap(): number {
    return Math.max(1, Math.floor(this.config.maxSamplesPerKey / (this.config.retentionDays + 1)));
  }

  /**
   * Record a new sample for drift monitoring. O(1): it goes into its UTC day's bucket, and a full
   * bucket keeps a uniform sample of the day (Algorithm R) instead of dropping older samples.
   * Pruning by age happens on the scheduled tick. Memory is bounded: a sample outside
   * [now - retention, now + skew] is dropped, and so is one for a new key past `maxSeries`.
   */
  recordSample(sample: DriftSample): void {
    if (!Number.isFinite(sample.value)) {
      this.warnOnce('non_finite_value', 'Drift sample dropped: value is not a finite number');
      return;
    }
    const at = sample.timestamp.getTime();
    const now = Date.now();
    if (!(at <= now + MAX_FUTURE_SKEW_MS) || at < now - this.config.retentionDays * DAY_MS) {
      this.warnOnce(
        'out_of_window',
        'Drift sample dropped: timestamp outside the retention window'
      );
      return;
    }
    const key = seriesKey(sample.model, sample.metric);
    let entry = this.series.get(key);
    if (!entry) {
      if (this.series.size >= (this.config.maxSeries ?? defaultDriftConfig.maxSeries)) {
        this.warnOnce('series_cap', 'Drift sample dropped: series cap reached');
        return;
      }
      entry = { model: sample.model, metric: sample.metric, days: new Map() };
      this.series.set(key, entry);
    }
    const day = utcDay(sample.timestamp);
    let bucket = entry.days.get(day);
    if (!bucket) {
      bucket = { samples: [], seen: 0 };
      entry.days.set(day, bucket);
    }
    bucket.seen++;
    if (bucket.samples.length < this.perDayCap()) {
      bucket.samples.push(sample);
      return;
    }
    const slot = this.randomIndex(bucket.seen);
    if (slot < bucket.samples.length) bucket.samples[slot] = sample;
  }

  /** Log a dropped-sample reason once per detector; the key itself is never logged. */
  private warnOnce(
    reason: 'series_cap' | 'out_of_window' | 'non_finite_value',
    message: string
  ): void {
    if (this.warned.has(reason)) return;
    this.warned.add(reason);
    logger.warn(
      { reason, maxSeries: this.config.maxSeries, retentionDays: this.config.retentionDays },
      message
    );
  }

  /**
   * Record human feedback as drift signal (IFC-024: Human-in-the-Loop)
   *
   * User feedback is a valuable signal for model drift detection:
   * - Score corrections indicate systematic scoring errors
   * - Negative feedback ratio tracks user satisfaction trends
   */
  recordFeedbackAsSignal(feedback: FeedbackDriftSignal): void {
    const timestamp = new Date();

    // Track user satisfaction (thumbs up = 1, thumbs down = 0, correction = 0.5)
    const thumbsDownOrCorrection = feedback.feedbackType === 'THUMBS_DOWN' ? 0 : 0.5;
    const satisfactionValue = feedback.feedbackType === 'THUMBS_UP' ? 1 : thumbsDownOrCorrection;

    this.recordSample({
      value: satisfactionValue,
      timestamp,
      model: feedback.modelVersion,
      metric: 'user_satisfaction',
      metadata: { feedbackType: feedback.feedbackType },
    });

    // For corrections, also track the error magnitude
    if (feedback.feedbackType === 'SCORE_CORRECTION' && feedback.correctedScore !== undefined) {
      const error = feedback.correctedScore - feedback.originalScore;
      this.recordSample({
        value: error,
        timestamp,
        model: feedback.modelVersion,
        metric: 'user_correction_error',
        metadata: {
          originalScore: feedback.originalScore,
          correctedScore: feedback.correctedScore,
        },
      });
    }

    logger.info(
      {
        modelVersion: feedback.modelVersion,
        feedbackType: feedback.feedbackType,
        satisfactionValue,
      },
      'Feedback recorded as drift signal'
    );
  }

  /**
   * Pin a baseline window for a metric (overrides the time-of-day reference).
   */
  setBaseline(model: string, metric: string, window: DriftWindow): void {
    const key = seriesKey(model, metric);
    this.baselines.set(key, window);

    logger.info({ model, metric, sampleCount: window.sampleCount }, 'Baseline window set');
  }

  /**
   * The time-of-day-matched reference window for a metric, or null when it has too few samples.
   */
  computeBaseline(model: string, metric: string, now: number = Date.now()): DriftWindow | null {
    const reference = this.referenceSamples(
      allSamples(this.series.get(seriesKey(model, metric))),
      now
    );
    if (reference.length < this.config.minSamplesRequired) {
      logger.warn(
        { model, metric, sampleCount: reference.length, required: this.config.minSamplesRequired },
        'Insufficient samples for baseline'
      );
      return null;
    }
    const values = reference.map((s) => s.value);
    return this.computeWindow(values, reference, this.edgesFor(metric, values));
  }

  /**
   * Evaluate one (model, metric) at `now`. Does not advance the event state machine; the
   * scheduled detectAllDrift() does.
   */
  detectDrift(model: string, metric: string, now: number = Date.now()): DriftResult {
    const key = seriesKey(model, metric);
    const samples = allSamples(this.series.get(key));
    const current = samples.filter(
      (s) => s.timestamp.getTime() > now - this.windowMs() && s.timestamp.getTime() <= now
    );
    const pinned = this.baselines.get(key);
    const state = this.persistence.get(key);
    const minCurrent = this.config.minSamplesRequired / 2;

    const result = pinned
      ? this.evaluateAgainstPinned(model, metric, pinned, current, minCurrent, now)
      : this.evaluateAgainstReference(model, metric, samples, current, minCurrent, now);
    result.inEvent = state?.inEvent ?? false;
    result.eventSeverity = state?.inEvent ? state.peakSeverity : 'none';

    if (result.status === 'evaluated') {
      this.pushHistory(result, now);
      if (result.detectedTick) {
        // `driftSeverity`, not `severity`: Loki reads a top-level `severity`
        // field as the line's level, which would index this warn line as critical.
        logger.warn(
          {
            model,
            metric,
            driftSeverity: result.severity,
            pValue: Number(result.pValue.toFixed(6)),
            driftScore: Number(result.driftScore.toFixed(4)),
          },
          'Output distribution shift detected on this tick'
        );
      }
    }
    return result;
  }

  /**
   * One scheduled tick: evaluate every tracked (model, metric) — optionally only `metrics` — and
   * advance the persistence state machine. Insufficient-data results never advance it.
   */
  detectAllDrift(options: { metrics?: readonly string[]; now?: number } = {}): DriftResult[] {
    const now = options.now ?? Date.now();
    const results: DriftResult[] = [];

    for (const entry of this.series.values()) {
      if (options.metrics && !options.metrics.includes(entry.metric)) continue;
      const result = this.detectDrift(entry.model, entry.metric, now);
      if (result.status === 'evaluated') {
        const step = this.applyPersistence(
          entry.model,
          entry.metric,
          result.detectedTick,
          result.severity
        );
        result.onset = step.onset;
        result.inEvent = step.inEvent;
        result.escalated = step.escalated;
        result.eventSeverity = step.eventSeverity;
      }
      results.push(result);
    }

    this.lastTickAt = new Date(now);
    return results;
  }

  /**
   * Advance the event state machine for one evaluated tick: an event opens on the third
   * consecutive detected tick (the onset) and closes after three consecutive clear ticks. A
   * detected tick that lifts an open event above the highest severity it had reached is an
   * escalation.
   */
  applyPersistence(
    model: string,
    metric: string,
    detected: boolean,
    severity: Severity = 'none'
  ): { onset: boolean; inEvent: boolean; escalated: boolean; eventSeverity: Severity } {
    const key = seriesKey(model, metric);
    const state = this.persistence.get(key) ?? {
      consecutiveDetected: 0,
      consecutiveClear: 0,
      inEvent: false,
      peakSeverity: 'none',
    };
    let onset = false;
    let escalated = false;

    if (detected) {
      state.consecutiveDetected++;
      state.consecutiveClear = 0;
      if (!state.inEvent && state.consecutiveDetected >= PERSISTENCE_TICKS) {
        state.inEvent = true;
        state.peakSeverity = severity;
        onset = true;
      } else if (
        state.inEvent &&
        SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(state.peakSeverity)
      ) {
        state.peakSeverity = severity;
        escalated = true;
      }
    } else {
      state.consecutiveClear++;
      state.consecutiveDetected = 0;
      if (state.inEvent && state.consecutiveClear >= PERSISTENCE_TICKS) {
        state.inEvent = false;
        state.peakSeverity = 'none';
      }
    }

    this.persistence.set(key, state);
    return { onset, inEvent: state.inEvent, escalated, eventSeverity: state.peakSeverity };
  }

  /**
   * Drop samples older than the retention window (whole day buckets, and the older part of the
   * boundary day) and age out history. The per-day caps already bound each key.
   *
   * A series with no samples left in retention is retired with its event state. Its ticks are
   * all insufficient_data, which never advance the state machine, so an event it had open would
   * otherwise keep health unhealthy forever.
   */
  pruneOnTick(now: number = Date.now()): void {
    const cutoff = now - this.config.retentionDays * DAY_MS;
    const cutoffDay = Math.floor(cutoff / DAY_MS);
    for (const [key, entry] of this.series) {
      for (const [day, bucket] of entry.days) {
        if (day < cutoffDay) entry.days.delete(day);
        else if (day === cutoffDay)
          bucket.samples = bucket.samples.filter((s) => s.timestamp.getTime() >= cutoff);
      }
      if (allSamples(entry).length === 0) this.retireSeries(key, entry);
    }
    this.pruneHistory(now);
  }

  private retireSeries(key: string, entry: SeriesEntry): void {
    const state = this.persistence.get(key);
    if (state?.inEvent) {
      // `driftSeverity`, not `severity`: Loki reads a top-level `severity` field as the level.
      logger.info(
        {
          model: entry.model,
          metric: entry.metric,
          driftSeverity: state.peakSeverity,
          retentionDays: this.config.retentionDays,
        },
        'Drift event closed: series retired, no samples in retention'
      );
    }
    this.persistence.delete(key);
    this.series.delete(key);
  }

  /**
   * Get drift history
   */
  getHistory(limit?: number): DriftResult[] {
    const sorted = [...this.driftHistory].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get current drift status summary
   */
  getStatus(): {
    trackedMetrics: number;
    totalSamples: number;
    driftDetected: boolean;
    highSeverityCount: number;
    lastCheck: Date | null;
  } {
    let totalSamples = 0;
    for (const entry of this.series.values()) {
      for (const bucket of entry.days.values()) totalSamples += bucket.samples.length;
    }

    // Health follows the events open now (3 consecutive ticks), never a single detected tick
    // and never a snapshot from an event that has since closed.
    const openEvents = [...this.persistence.values()].filter((s) => s.inEvent);

    return {
      trackedMetrics: this.series.size,
      totalSamples,
      driftDetected: openEvents.length > 0,
      highSeverityCount: openEvents.filter((s) => isHighSeverity(s.peakSeverity)).length,
      lastCheck:
        this.lastTickAt ??
        (this.driftHistory.length > 0 ? this.driftHistory.at(-1)!.timestamp : null),
    };
  }

  private windowMs(): number {
    return this.config.windowSizeHours * HOUR_MS;
  }

  /** The same `windowSizeHours` slice on each of the previous `referenceDays` days. */
  private referenceSamples(samples: readonly DriftSample[], now: number): DriftSample[] {
    const out: DriftSample[] = [];
    for (let day = 1; day <= this.config.referenceDays; day++) {
      const end = now - day * DAY_MS;
      const start = end - this.windowMs();
      for (const s of samples) {
        const t = s.timestamp.getTime();
        if (t >= start && t < end) out.push(s);
      }
    }
    return out.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private edgesFor(metric: string, referenceValues: readonly number[]): number[] {
    if (BOUNDED_METRICS.has(metric)) return fixedEdges(0, 1, this.config.binCount);
    return fixedEdges(
      Math.min(...referenceValues),
      Math.max(...referenceValues),
      this.config.binCount
    );
  }

  private evaluateAgainstReference(
    model: string,
    metric: string,
    samples: readonly DriftSample[],
    current: DriftSample[],
    minCurrent: number,
    now: number
  ): DriftResult {
    const reference = this.referenceSamples(samples, now);
    const refValues = reference.map((s) => s.value);
    const curValues = current.map((s) => s.value);

    if (reference.length < this.config.minSamplesRequired || current.length < minCurrent) {
      return this.insufficient(model, metric, refValues, reference, curValues, current, now);
    }

    const edges = this.edgesFor(metric, refValues);
    const refCounts = binCounts(refValues, edges);
    const curCounts = binCounts(curValues, edges);
    const ks = ksTwoSample(refValues, curValues);
    return this.buildResult(model, metric, {
      ks,
      psi: excessPsi(refCounts, curCounts),
      baselineWindow: this.computeWindow(refValues, reference, edges),
      currentWindow: this.computeWindow(curValues, current, edges),
      now,
    });
  }

  /**
   * The edges a pinned window was binned on. Windows from computeBaseline() carry them; a
   * legacy window without them falls back to [0, 1] for bounded metrics, else its extrema.
   */
  private pinnedEdges(metric: string, pinned: DriftWindow): number[] {
    const bins = pinned.distribution.length;
    if (pinned.binEdges?.length === bins + 1) return pinned.binEdges;
    if (BOUNDED_METRICS.has(metric)) return fixedEdges(0, 1, bins);
    return fixedEdges(pinned.min, pinned.max, bins);
  }

  private evaluateAgainstPinned(
    model: string,
    metric: string,
    pinned: DriftWindow,
    current: DriftSample[],
    minCurrent: number,
    now: number
  ): DriftResult {
    const curValues = current.map((s) => s.value);
    if (
      pinned.distribution.length === 0 ||
      pinned.sampleCount < this.config.minSamplesRequired ||
      current.length < minCurrent
    ) {
      return this.insufficient(model, metric, [], [], curValues, current, now, pinned);
    }

    const edges = this.pinnedEdges(metric, pinned);
    const refCounts = pinned.distribution.map((p) => p * pinned.sampleCount);
    const curCounts = binCounts(curValues, edges);
    return this.buildResult(model, metric, {
      ks: ksFromCounts(refCounts, curCounts),
      psi: excessPsi(refCounts, curCounts),
      baselineWindow: pinned,
      currentWindow: this.computeWindow(curValues, current, edges),
      now,
    });
  }

  private buildResult(
    model: string,
    metric: string,
    input: {
      ks: { d: number; pValue: number };
      psi: number;
      baselineWindow: DriftWindow;
      currentWindow: DriftWindow;
      now: number;
    }
  ): DriftResult {
    const effects = { excessPsi: input.psi, d: input.ks.d };
    const detectedTick = isDetectedTick(
      { pValue: input.ks.pValue, ...effects },
      this.config.pValueThreshold
    );
    const severity = detectedTick ? severityFrom(effects) : 'none';
    return {
      model,
      metric,
      status: 'evaluated',
      detected: detectedTick,
      detectedTick,
      onset: false,
      inEvent: false,
      severity,
      baselineWindow: input.baselineWindow,
      currentWindow: input.currentWindow,
      pValue: input.ks.pValue,
      driftScore: compositeScore(effects),
      timestamp: new Date(input.now),
      recommendations: this.generateRecommendations(severity, metric),
    };
  }

  private insufficient(
    model: string,
    metric: string,
    refValues: number[],
    reference: DriftSample[],
    curValues: number[],
    current: DriftSample[],
    now: number,
    pinned?: DriftWindow
  ): DriftResult {
    const status: DriftStatus = 'insufficient_data';
    const edges = fixedEdges(0, 1, this.config.binCount);
    return {
      model,
      metric,
      status,
      detected: false,
      detectedTick: false,
      onset: false,
      inEvent: false,
      severity: 'none',
      baselineWindow: pinned ?? this.computeWindow(refValues, reference, edges),
      currentWindow: this.computeWindow(curValues, current, edges),
      pValue: 1,
      driftScore: 0,
      timestamp: new Date(now),
      recommendations: [],
    };
  }

  private pushHistory(result: DriftResult, now: number): void {
    this.driftHistory.push(result);
    // Amortised: only rebuild when the oldest entry has aged out.
    if (this.driftHistory[0].timestamp.getTime() < now - this.config.referenceDays * DAY_MS) {
      this.pruneHistory(now);
    }
  }

  private pruneHistory(now: number): void {
    const cutoff = now - this.config.referenceDays * DAY_MS;
    this.driftHistory = this.driftHistory.filter((r) => r.timestamp.getTime() >= cutoff);
  }

  /**
   * Compute a statistical window from values, binned on the shared edges
   */
  private computeWindow(
    values: readonly number[],
    samples: readonly DriftSample[],
    edges: readonly number[]
  ): DriftWindow {
    const n = values.length;
    if (n === 0) return this.emptyWindow();
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const times = samples.map((s) => s.timestamp.getTime());
    return {
      startTime: new Date(Math.min(...times)),
      endTime: new Date(Math.max(...times)),
      sampleCount: n,
      mean,
      variance,
      min: Math.min(...values),
      max: Math.max(...values),
      distribution: binCounts(values, edges).map((count) => count / n),
      binEdges: [...edges],
    };
  }

  /**
   * Generate recommendations based on drift severity
   */
  private generateRecommendations(severity: string, metric: string): string[] {
    const recommendations: string[] = [];

    switch (severity) {
      case 'critical':
        recommendations.push(
          'URGENT: Immediately investigate model performance',
          'Consider rolling back to previous model version',
          'Alert on-call team'
        );
        break;
      case 'high':
        recommendations.push(
          'Review recent model inputs for anomalies',
          'Compare model outputs with human evaluations',
          'Schedule model retraining if drift persists'
        );
        break;
      case 'medium':
        recommendations.push(
          'Monitor closely over next 24 hours',
          'Review input data quality',
          'Check for seasonal patterns'
        );
        break;
      case 'low':
        recommendations.push('Continue monitoring', 'Document observation for trend analysis');
        break;
    }

    if (metric === 'latency') {
      recommendations.push('Check infrastructure metrics (CPU, memory, network)');
    }

    if (metric === 'error_rate') {
      recommendations.push('Review error logs for patterns', 'Check API provider status');
    }

    return recommendations;
  }

  /**
   * Create empty window for default values
   */
  private emptyWindow(): DriftWindow {
    return {
      startTime: new Date(),
      endTime: new Date(),
      sampleCount: 0,
      mean: 0,
      variance: 0,
      min: 0,
      max: 0,
      distribution: [],
    };
  }
}

/**
 * Default drift detector configuration.
 * A 6h current window checked every 30 min against the same 6h slice on the previous 7 days;
 * α = 0.01 because there are 48 ticks a day; samples kept 8 days (7 reference days + window).
 */
export const defaultDriftConfig: DriftDetectorConfig = {
  windowSizeHours: 6,
  slidingIntervalMinutes: 30,
  pValueThreshold: 0.01,
  minSamplesRequired: 50,
  referenceDays: 7,
  retentionDays: 8,
  maxSamplesPerKey: 50_000,
  maxSeries: 64,
  binCount: 10,
};

/**
 * Global drift detector instance
 */
export const driftDetector = new DriftDetector(defaultDriftConfig);
