import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

// Simple logger - in production, integrate with existing logging infrastructure
const logger = {
  info: (data: unknown, msg: string) => console.log(`[INFO] ${msg}`, data),
  warn: (data: unknown, msg: string) => console.warn(`[WARN] ${msg}`, data),
  error: (data: unknown, msg: string) => console.error(`[ERROR] ${msg}`, data),
};

/**
 * Bias Detector - IFC-125
 *
 * Monitors AI model outputs for:
 * - Demographic bias in lead scoring
 * - Prediction fairness across segments
 * - Model drift over time
 */

// ============================================
// TYPES
// ============================================

export interface BiasMetric {
  timestamp: string;
  model_version: string;
  demographic_segment: string;
  metric_name: string;
  value: number;
  threshold: number;
  passed: boolean;
  sample_size: number;
}

export interface LeadScoringBiasCheck {
  leadId: string;
  score: number;
  metadata: {
    emailDomain?: string;
    jobTitle?: string;
    company?: string;
    source?: string;
  };
}

export interface BiasReport {
  period: string;
  totalScored: number;
  biasDetected: boolean;
  violations: BiasViolation[];
  summary: Record<string, number>;
}

export interface BiasViolation {
  segment: string;
  metric: string;
  actual: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high';
}

// ============================================
// BIAS DETECTION THRESHOLDS
// ============================================

/**
 * Fairness thresholds based on industry best practices
 */
const FAIRNESS_THRESHOLDS = {
  // Score distribution should not vary more than 10% across segments
  score_variance: 0.1,

  // Conversion rate predictions should be within 5% across segments
  conversion_variance: 0.05,

  // Model confidence should not systematically differ
  confidence_variance: 0.08,

  // Minimum sample size for statistical significance
  min_sample_size: 30,
};

// ============================================
// BIAS DETECTION FUNCTIONS
// ============================================

/**
 * Analyze lead scores for demographic bias
 */
export function detectScoreBias(
  scores: LeadScoringBiasCheck[]
): {
  biasDetected: boolean;
  violations: BiasViolation[];
  metrics: BiasMetric[];
} {
  const violations: BiasViolation[] = [];
  const metrics: BiasMetric[] = [];

  // Group scores by email domain (proxy for company type)
  const scoresByDomain = groupBy(scores, (s) => getDomainCategory(s.metadata.emailDomain));

  // Calculate mean score per segment
  const segmentMeans: Record<string, number> = {};
  for (const [segment, segmentScores] of Object.entries(scoresByDomain)) {
    if (segmentScores.length < FAIRNESS_THRESHOLDS.min_sample_size) {
      continue; // Skip segments with insufficient data
    }

    const mean = segmentScores.reduce((sum, s) => sum + s.score, 0) / segmentScores.length;
    segmentMeans[segment] = mean;

    metrics.push({
      timestamp: new Date().toISOString(),
      model_version: 'v1',
      demographic_segment: segment,
      metric_name: 'mean_score',
      value: mean,
      threshold: 50, // Baseline expected mean
      passed: Math.abs(mean - 50) < 20, // Allow ±20 variance
      sample_size: segmentScores.length,
    });
  }

  // Check for score variance across segments
  const means = Object.values(segmentMeans);
  if (means.length >= 2) {
    const maxMean = Math.max(...means);
    const minMean = Math.min(...means);
    const variance = (maxMean - minMean) / ((maxMean + minMean) / 2);

    if (variance > FAIRNESS_THRESHOLDS.score_variance) {
      violations.push({
        segment: 'all',
        metric: 'score_variance',
        actual: variance,
        threshold: FAIRNESS_THRESHOLDS.score_variance,
        severity: variance > 0.2 ? 'high' : 'medium',
      });

      logger.warn(
        {
          variance,
          threshold: FAIRNESS_THRESHOLDS.score_variance,
          segmentMeans,
        },
        'Score bias detected across demographic segments'
      );
    }
  }

  return {
    biasDetected: violations.length > 0,
    violations,
    metrics,
  };
}

/**
 * Monitor model drift over time
 */
export async function detectModelDrift(
  currentMetrics: BiasMetric[],
  historicalMetricsPath: string
): Promise<{
  driftDetected: boolean;
  driftMetrics: Array<{ metric: string; drift: number }>;
}> {
  try {
    // Load historical metrics
    const historicalData = await readFile(historicalMetricsPath, 'utf-8');
    const historicalMetrics: BiasMetric[] = parseCSV(historicalData);

    // Compare current vs historical
    const driftMetrics: Array<{ metric: string; drift: number }> = [];

    for (const current of currentMetrics) {
      const historical = historicalMetrics
        .filter(
          (h) =>
            h.metric_name === current.metric_name &&
            h.demographic_segment === current.demographic_segment
        )
        .slice(-10); // Last 10 data points

      if (historical.length < 3) {
        continue; // Not enough historical data
      }

      const historicalMean = historical.reduce((sum, h) => sum + h.value, 0) / historical.length;
      const drift = Math.abs(current.value - historicalMean) / historicalMean;

      if (drift > 0.15) {
        // 15% drift threshold
        driftMetrics.push({
          metric: `${current.demographic_segment}:${current.metric_name}`,
          drift,
        });

        logger.warn(
          {
            metric: current.metric_name,
            segment: current.demographic_segment,
            current: current.value,
            historical: historicalMean,
            drift,
          },
          'Model drift detected'
        );
      }
    }

    return {
      driftDetected: driftMetrics.length > 0,
      driftMetrics,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to detect model drift');
    return {
      driftDetected: false,
      driftMetrics: [],
    };
  }
}

/**
 * Save bias metrics to CSV
 */
export async function saveBiasMetrics(
  metrics: BiasMetric[],
  outputPath: string
): Promise<void> {
  const csv = metricsToCSV(metrics);
  await writeFile(outputPath, csv, 'utf-8');
  logger.info({ outputPath, count: metrics.length }, 'Bias metrics saved');
}

/**
 * Generate bias report
 */
export function generateBiasReport(
  period: string,
  allScores: LeadScoringBiasCheck[]
): BiasReport {
  const { biasDetected, violations, metrics } = detectScoreBias(allScores);

  // Calculate summary statistics
  const summary: Record<string, number> = {
    total_scored: allScores.length,
    violations_count: violations.length,
    high_severity: violations.filter((v) => v.severity === 'high').length,
    medium_severity: violations.filter((v) => v.severity === 'medium').length,
    low_severity: violations.filter((v) => v.severity === 'low').length,
  };

  // Calculate score distribution
  const scores = allScores.map((s) => s.score);
  summary.mean_score = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  summary.std_dev = Math.sqrt(
    scores.reduce((sum, s) => sum + Math.pow(s - summary.mean_score, 2), 0) / scores.length
  );

  return {
    period,
    totalScored: allScores.length,
    biasDetected,
    violations,
    summary,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Categorize email domain
 */
function getDomainCategory(email?: string): string {
  if (!email) return 'unknown';

  const domain = email.split('@')[1]?.toLowerCase() || 'unknown';

  // Free email providers
  if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
    return 'free_email';
  }

  // Corporate domains (simplified categorization)
  if (domain.includes('.gov') || domain.includes('.edu')) {
    return 'institutional';
  }

  return 'corporate';
}

/**
 * Group array by key function
 */
function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const key = keyFn(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Convert metrics to CSV format
 */
function metricsToCSV(metrics: BiasMetric[]): string {
  const headers = [
    'timestamp',
    'model_version',
    'demographic_segment',
    'metric_name',
    'value',
    'threshold',
    'passed',
    'sample_size',
  ];

  const rows = metrics.map((m) =>
    [
      m.timestamp,
      m.model_version,
      m.demographic_segment,
      m.metric_name,
      m.value.toFixed(2),
      m.threshold.toFixed(2),
      m.passed ? 'true' : 'false',
      m.sample_size,
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Parse CSV to metrics
 */
function parseCSV(csv: string): BiasMetric[] {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return {
      timestamp: values[0],
      model_version: values[1],
      demographic_segment: values[2],
      metric_name: values[3],
      value: parseFloat(values[4]),
      threshold: parseFloat(values[5]),
      passed: values[6] === 'true',
      sample_size: parseInt(values[7], 10),
    };
  });
}
