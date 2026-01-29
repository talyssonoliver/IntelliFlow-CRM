/**
 * AI Model Drift Detector
 * Monitors AI model outputs for distribution shifts and performance degradation.
 * Implements statistical tests to detect drift within 1 day (KPI requirement).
 *
 * @module drift-detector
 * @task IFC-117
 */

import pino from 'pino';

const logger = pino({
  name: 'drift-detector',
  level: process.env.LOG_LEVEL || 'info',
});

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
}

/**
 * Drift detection result
 */
export interface DriftResult {
  detected: boolean;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  baselineWindow: DriftWindow;
  currentWindow: DriftWindow;
  pValue: number;
  driftScore: number;
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
  minSamplesRequired: number;
  driftScoreThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
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
  | 'user_correction_error'  // IFC-024: Human feedback
  | 'user_satisfaction';     // IFC-024: Human feedback

/**
 * Human feedback data for drift signals (IFC-024)
 */
export interface FeedbackDriftSignal {
  originalScore: number;
  correctedScore?: number;
  feedbackType: 'THUMBS_UP' | 'THUMBS_DOWN' | 'SCORE_CORRECTION';
  modelVersion: string;
}

/**
 * Drift Detector Service
 * Monitors AI model outputs for statistical drift using Kolmogorov-Smirnov test
 * and Population Stability Index (PSI).
 */
export class DriftDetector {
  private samples: Map<string, DriftSample[]> = new Map();
  private baselines: Map<string, DriftWindow> = new Map();
  private driftHistory: DriftResult[] = [];

  constructor(private readonly config: DriftDetectorConfig) {
    logger.info({ config }, 'DriftDetector initialized');
  }

  /**
   * Record a new sample for drift monitoring
   */
  recordSample(sample: DriftSample): void {
    const key = `${sample.model}:${sample.metric}`;

    if (!this.samples.has(key)) {
      this.samples.set(key, []);
    }

    const samples = this.samples.get(key)!;
    samples.push(sample);

    // Prune old samples (keep 48 hours of data)
    const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const prunedSamples = samples.filter(s => s.timestamp > cutoffTime);
    this.samples.set(key, prunedSamples);

    logger.debug(
      {
        key,
        value: sample.value,
        sampleCount: prunedSamples.length,
      },
      'Drift sample recorded'
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
    const satisfactionValue = feedback.feedbackType === 'THUMBS_UP' ? 1
      : feedback.feedbackType === 'THUMBS_DOWN' ? 0
      : 0.5;

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
   * Set baseline window for a specific metric
   */
  setBaseline(model: string, metric: string, window: DriftWindow): void {
    const key = `${model}:${metric}`;
    this.baselines.set(key, window);

    logger.info(
      {
        key,
        sampleCount: window.sampleCount,
        mean: window.mean,
      },
      'Baseline window set'
    );
  }

  /**
   * Compute baseline from current samples
   */
  computeBaseline(model: string, metric: string): DriftWindow | null {
    const key = `${model}:${metric}`;
    const samples = this.samples.get(key);

    if (!samples || samples.length < this.config.minSamplesRequired) {
      logger.warn(
        { key, sampleCount: samples?.length ?? 0, required: this.config.minSamplesRequired },
        'Insufficient samples for baseline'
      );
      return null;
    }

    // Use oldest samples for baseline
    const sortedSamples = [...samples].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const baselineCutoff = sortedSamples.length / 2;
    const baselineSamples = sortedSamples.slice(0, baselineCutoff);
    const values = baselineSamples.map(s => s.value);

    const window = this.computeWindow(values, baselineSamples);
    this.setBaseline(model, metric, window);

    return window;
  }

  /**
   * Detect drift for a specific model and metric
   */
  detectDrift(model: string, metric: string): DriftResult {
    const key = `${model}:${metric}`;
    const samples = this.samples.get(key);
    const baseline = this.baselines.get(key);

    // Default result for insufficient data
    const defaultResult: DriftResult = {
      detected: false,
      severity: 'none',
      metric,
      baselineWindow: baseline ?? this.emptyWindow(),
      currentWindow: this.emptyWindow(),
      pValue: 1.0,
      driftScore: 0,
      timestamp: new Date(),
      recommendations: [],
    };

    if (!samples || samples.length < this.config.minSamplesRequired) {
      logger.debug({ key }, 'Insufficient samples for drift detection');
      return defaultResult;
    }

    // Compute or use existing baseline
    const baselineWindow = baseline ?? this.computeBaseline(model, metric);
    if (!baselineWindow) {
      return defaultResult;
    }

    // Get current window samples
    const windowCutoff = new Date(
      Date.now() - this.config.windowSizeHours * 60 * 60 * 1000
    );
    const currentSamples = samples.filter(s => s.timestamp > windowCutoff);

    if (currentSamples.length < this.config.minSamplesRequired / 2) {
      logger.debug({ key, currentCount: currentSamples.length }, 'Insufficient current samples');
      return defaultResult;
    }

    const currentValues = currentSamples.map(s => s.value);
    const currentWindow = this.computeWindow(currentValues, currentSamples);

    // Perform statistical tests
    const ksResult = this.kolmogorovSmirnovTest(
      baselineWindow.distribution,
      currentWindow.distribution
    );
    const psi = this.populationStabilityIndex(
      baselineWindow.distribution,
      currentWindow.distribution
    );

    // Combine scores
    const driftScore = (1 - ksResult.pValue) * 0.5 + Math.min(psi / 0.25, 1) * 0.5;
    const severity = this.classifySeverity(driftScore);
    const detected = severity !== 'none';

    const result: DriftResult = {
      detected,
      severity,
      metric,
      baselineWindow,
      currentWindow,
      pValue: ksResult.pValue,
      driftScore,
      timestamp: new Date(),
      recommendations: this.generateRecommendations(severity, metric, driftScore),
    };

    this.driftHistory.push(result);

    if (detected) {
      logger.warn(
        {
          key,
          severity,
          driftScore: driftScore.toFixed(4),
          pValue: ksResult.pValue.toFixed(4),
          baselineMean: baselineWindow.mean.toFixed(4),
          currentMean: currentWindow.mean.toFixed(4),
        },
        'Drift detected!'
      );
    }

    return result;
  }

  /**
   * Run drift detection for all tracked model-metric pairs
   */
  detectAllDrift(): DriftResult[] {
    const results: DriftResult[] = [];

    for (const key of this.samples.keys()) {
      const [model, metric] = key.split(':');
      const result = this.detectDrift(model, metric);
      results.push(result);
    }

    return results;
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
    for (const samples of this.samples.values()) {
      totalSamples += samples.length;
    }

    const recentDrift = this.driftHistory.filter(
      d => d.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const highSeverity = recentDrift.filter(
      d => d.severity === 'high' || d.severity === 'critical'
    );

    return {
      trackedMetrics: this.samples.size,
      totalSamples,
      driftDetected: recentDrift.some(d => d.detected),
      highSeverityCount: highSeverity.length,
      lastCheck: this.driftHistory.length > 0
        ? this.driftHistory[this.driftHistory.length - 1].timestamp
        : null,
    };
  }

  /**
   * Compute statistical window from values
   */
  private computeWindow(values: number[], samples: DriftSample[]): DriftWindow {
    const n = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Create histogram for distribution comparison (10 bins)
    const binCount = 10;
    const binWidth = (max - min) / binCount || 1;
    const distribution = new Array(binCount).fill(0);

    for (const v of values) {
      const binIndex = Math.min(
        Math.floor((v - min) / binWidth),
        binCount - 1
      );
      distribution[binIndex]++;
    }

    // Normalize to probabilities
    const normalizedDist = distribution.map(count => count / n);

    return {
      startTime: samples.length > 0 ? samples[0].timestamp : new Date(),
      endTime: samples.length > 0 ? samples[samples.length - 1].timestamp : new Date(),
      sampleCount: n,
      mean,
      variance,
      min,
      max,
      distribution: normalizedDist,
    };
  }

  /**
   * Kolmogorov-Smirnov test approximation
   */
  private kolmogorovSmirnovTest(
    dist1: number[],
    dist2: number[]
  ): { statistic: number; pValue: number } {
    // Compute cumulative distributions
    const cdf1 = this.toCDF(dist1);
    const cdf2 = this.toCDF(dist2);

    // Find maximum difference
    let maxDiff = 0;
    for (let i = 0; i < cdf1.length; i++) {
      const diff = Math.abs(cdf1[i] - cdf2[i]);
      if (diff > maxDiff) {
        maxDiff = diff;
      }
    }

    // Approximate p-value using asymptotic formula
    // For large samples, D * sqrt(n) follows Kolmogorov distribution
    const n = 100; // Effective sample size
    const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * maxDiff;
    const pValue = 2 * Math.exp(-2 * lambda * lambda);

    return {
      statistic: maxDiff,
      pValue: Math.min(1, Math.max(0, pValue)),
    };
  }

  /**
   * Population Stability Index (PSI)
   */
  private populationStabilityIndex(
    expected: number[],
    actual: number[]
  ): number {
    let psi = 0;
    const epsilon = 0.0001; // Avoid log(0)

    for (let i = 0; i < expected.length; i++) {
      const e = Math.max(expected[i], epsilon);
      const a = Math.max(actual[i], epsilon);
      psi += (a - e) * Math.log(a / e);
    }

    return psi;
  }

  /**
   * Convert probability distribution to CDF
   */
  private toCDF(distribution: number[]): number[] {
    const cdf: number[] = [];
    let cumulative = 0;

    for (const prob of distribution) {
      cumulative += prob;
      cdf.push(cumulative);
    }

    return cdf;
  }

  /**
   * Classify drift severity based on score
   */
  private classifySeverity(
    driftScore: number
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    const { driftScoreThresholds } = this.config;

    if (driftScore >= driftScoreThresholds.critical) return 'critical';
    if (driftScore >= driftScoreThresholds.high) return 'high';
    if (driftScore >= driftScoreThresholds.medium) return 'medium';
    if (driftScore >= driftScoreThresholds.low) return 'low';
    return 'none';
  }

  /**
   * Generate recommendations based on drift severity
   */
  private generateRecommendations(
    severity: string,
    metric: string,
    _driftScore: number
  ): string[] {
    const recommendations: string[] = [];

    switch (severity) {
      case 'critical':
        recommendations.push('URGENT: Immediately investigate model performance');
        recommendations.push('Consider rolling back to previous model version');
        recommendations.push('Alert on-call team');
        break;
      case 'high':
        recommendations.push('Review recent model inputs for anomalies');
        recommendations.push('Compare model outputs with human evaluations');
        recommendations.push('Schedule model retraining if drift persists');
        break;
      case 'medium':
        recommendations.push('Monitor closely over next 24 hours');
        recommendations.push('Review input data quality');
        recommendations.push('Check for seasonal patterns');
        break;
      case 'low':
        recommendations.push('Continue monitoring');
        recommendations.push('Document observation for trend analysis');
        break;
    }

    if (metric === 'latency') {
      recommendations.push('Check infrastructure metrics (CPU, memory, network)');
    }

    if (metric === 'error_rate') {
      recommendations.push('Review error logs for patterns');
      recommendations.push('Check API provider status');
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
 * Default drift detector configuration
 * Configured to detect drift within 1 day (KPI requirement)
 */
export const defaultDriftConfig: DriftDetectorConfig = {
  windowSizeHours: 6, // 6-hour windows for comparison
  slidingIntervalMinutes: 30, // Check every 30 minutes
  pValueThreshold: 0.05, // Standard statistical significance
  minSamplesRequired: 50, // Minimum samples for statistical validity
  driftScoreThresholds: {
    low: 0.1,
    medium: 0.25,
    high: 0.5,
    critical: 0.75,
  },
};

/**
 * Global drift detector instance
 */
export const driftDetector = new DriftDetector(defaultDriftConfig);

/**
 * Prometheus metrics format for drift detection
 */
export function getDriftMetrics(): string {
  const status = driftDetector.getStatus();
  const history = driftDetector.getHistory(10);

  let metrics = '';

  // Gauge metrics
  metrics += `# HELP intelliflow_ai_drift_tracked_metrics Number of tracked drift metrics\n`;
  metrics += `# TYPE intelliflow_ai_drift_tracked_metrics gauge\n`;
  metrics += `intelliflow_ai_drift_tracked_metrics ${status.trackedMetrics}\n`;

  metrics += `# HELP intelliflow_ai_drift_total_samples Total drift samples collected\n`;
  metrics += `# TYPE intelliflow_ai_drift_total_samples gauge\n`;
  metrics += `intelliflow_ai_drift_total_samples ${status.totalSamples}\n`;

  metrics += `# HELP intelliflow_ai_drift_detected Whether drift is detected (1=yes, 0=no)\n`;
  metrics += `# TYPE intelliflow_ai_drift_detected gauge\n`;
  metrics += `intelliflow_ai_drift_detected ${status.driftDetected ? 1 : 0}\n`;

  metrics += `# HELP intelliflow_ai_drift_high_severity_count High severity drift detections in last 24h\n`;
  metrics += `# TYPE intelliflow_ai_drift_high_severity_count gauge\n`;
  metrics += `intelliflow_ai_drift_high_severity_count ${status.highSeverityCount}\n`;

  // Per-metric drift scores
  metrics += `# HELP intelliflow_ai_drift_score Drift score by model and metric\n`;
  metrics += `# TYPE intelliflow_ai_drift_score gauge\n`;
  for (const result of history) {
    if (result.baselineWindow.sampleCount > 0) {
      metrics += `intelliflow_ai_drift_score{metric="${result.metric}",severity="${result.severity}"} ${result.driftScore.toFixed(4)}\n`;
    }
  }

  return metrics;
}
