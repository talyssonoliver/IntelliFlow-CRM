/**
 * Statistical Analysis Utilities
 *
 * Implements statistical tests for A/B experiment analysis:
 * - Welch's t-test (unequal variances)
 * - Chi-square test (conversion rates)
 * - Cohen's d (effect size)
 * - Confidence intervals
 * - Power analysis
 *
 * Task: IFC-025 - A/B Testing Framework
 */

import {
  EXPERIMENT_DEFAULTS,
  EFFECT_SIZE_THRESHOLDS,
} from '@intelliflow/domain';

// =============================================================================
// Types
// =============================================================================

export interface TTestResult {
  tStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  isSignificant: boolean;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

export interface ChiSquareResult {
  chiSquareStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  isSignificant: boolean;
}

export interface DescriptiveStats {
  n: number;
  mean: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface ExperimentAnalysis {
  control: DescriptiveStats;
  treatment: DescriptiveStats;
  tTest: TTestResult;
  effectSize: number;
  effectSizeInterpretation: 'NEGLIGIBLE' | 'SMALL' | 'MEDIUM' | 'LARGE';
  chiSquare?: ChiSquareResult;
  recommendation: string;
  winner: 'control' | 'treatment' | null;
}

// =============================================================================
// Descriptive Statistics
// =============================================================================

/**
 * Calculate descriptive statistics for a sample
 */
export function calculateDescriptiveStats(data: number[]): DescriptiveStats {
  if (data.length === 0) {
    return { n: 0, mean: 0, variance: 0, stdDev: 0, min: 0, max: 0 };
  }

  const n = data.length;
  const mean = data.reduce((sum, x) => sum + x, 0) / n;

  // Bessel's correction (n-1) for sample variance
  const variance =
    n > 1
      ? data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1)
      : 0;

  return {
    n,
    mean,
    variance,
    stdDev: Math.sqrt(variance),
    min: Math.min(...data),
    max: Math.max(...data),
  };
}

// =============================================================================
// Welch's t-test
// =============================================================================

/**
 * Welch's t-test for comparing two samples with unequal variances
 * More robust than Student's t-test when sample sizes or variances differ
 *
 * Formula:
 * t = (x̄₁ - x̄₂) / √(s₁²/n₁ + s₂²/n₂)
 *
 * Welch-Satterthwaite degrees of freedom:
 * df = (s₁²/n₁ + s₂²/n₂)² / ((s₁²/n₁)²/(n₁-1) + (s₂²/n₂)²/(n₂-1))
 */
export function welchTTest(
  control: number[],
  treatment: number[],
  alpha: number = EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
): TTestResult {
  const controlStats = calculateDescriptiveStats(control);
  const treatmentStats = calculateDescriptiveStats(treatment);

  return welchTTestFromStats(
    controlStats.mean,
    controlStats.variance,
    controlStats.n,
    treatmentStats.mean,
    treatmentStats.variance,
    treatmentStats.n,
    alpha
  );
}

/**
 * Welch's t-test from pre-computed statistics
 */
export function welchTTestFromStats(
  mean1: number,
  var1: number,
  n1: number,
  mean2: number,
  var2: number,
  n2: number,
  alpha: number = EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
): TTestResult {
  // Prevent division by zero
  if (n1 < 2 || n2 < 2) {
    return {
      tStatistic: 0,
      pValue: 1,
      degreesOfFreedom: 0,
      isSignificant: false,
      confidenceInterval: { lower: 0, upper: 0 },
    };
  }

  // Standard error of the difference
  const se1 = var1 / n1;
  const se2 = var2 / n2;
  const seDiff = Math.sqrt(se1 + se2);

  // t-statistic
  const tStatistic = seDiff > 0 ? (mean1 - mean2) / seDiff : 0;

  // If t-statistic is 0 (identical means), return non-significant result
  if (tStatistic === 0) {
    return {
      tStatistic: 0,
      pValue: 1,
      degreesOfFreedom: n1 + n2 - 2,
      isSignificant: false,
      confidenceInterval: { lower: 0, upper: 0 },
    };
  }

  // Welch-Satterthwaite degrees of freedom
  const numerator = Math.pow(se1 + se2, 2);
  const denominator =
    Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1);
  const df = denominator > 0 ? numerator / denominator : 1;

  // p-value (two-tailed) using t-distribution approximation
  const pValue = tDistributionPValue(Math.abs(tStatistic), df);

  // Confidence interval for the difference in means
  const tCritical = tDistributionCritical(alpha / 2, df);
  const marginOfError = tCritical * seDiff;
  const diff = mean1 - mean2;

  return {
    tStatistic,
    pValue,
    degreesOfFreedom: df,
    isSignificant: pValue < alpha,
    confidenceInterval: {
      lower: diff - marginOfError,
      upper: diff + marginOfError,
    },
  };
}

// =============================================================================
// Chi-Square Test
// =============================================================================

/**
 * Chi-square test for comparing conversion rates between two groups
 *
 * Uses 2x2 contingency table:
 *                 Converted  Not Converted
 * Control         a          b
 * Treatment       c          d
 *
 * χ² = Σ((O - E)² / E) for each cell
 */
export function chiSquareTest(
  controlConversions: number,
  controlTotal: number,
  treatmentConversions: number,
  treatmentTotal: number,
  alpha: number = EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
): ChiSquareResult {
  // Observed values
  const a = controlConversions;
  const b = controlTotal - controlConversions;
  const c = treatmentConversions;
  const d = treatmentTotal - treatmentConversions;

  const total = a + b + c + d;
  const rowControl = a + b;
  const rowTreatment = c + d;
  const colConverted = a + c;
  const colNotConverted = b + d;

  if (total === 0 || rowControl === 0 || rowTreatment === 0) {
    return {
      chiSquareStatistic: 0,
      pValue: 1,
      degreesOfFreedom: 1,
      isSignificant: false,
    };
  }

  // Expected values
  const expectedA = (rowControl * colConverted) / total;
  const expectedB = (rowControl * colNotConverted) / total;
  const expectedC = (rowTreatment * colConverted) / total;
  const expectedD = (rowTreatment * colNotConverted) / total;

  // Chi-square statistic with Yates' continuity correction for 2x2 tables
  const chiSquare =
    calculateChiSquareComponent(a, expectedA) +
    calculateChiSquareComponent(b, expectedB) +
    calculateChiSquareComponent(c, expectedC) +
    calculateChiSquareComponent(d, expectedD);

  // p-value from chi-square distribution (df = 1 for 2x2 table)
  const pValue = chiSquareDistributionPValue(chiSquare, 1);

  return {
    chiSquareStatistic: chiSquare,
    pValue,
    degreesOfFreedom: 1,
    isSignificant: pValue < alpha,
  };
}

function calculateChiSquareComponent(observed: number, expected: number): number {
  if (expected === 0) return 0;
  return Math.pow(observed - expected, 2) / expected;
}

// =============================================================================
// Effect Size (Cohen's d)
// =============================================================================

/**
 * Cohen's d effect size
 *
 * Measures the standardized difference between two means
 * d = (M₁ - M₂) / s_pooled
 *
 * where s_pooled = √[((n₁-1)s₁² + (n₂-1)s₂²) / (n₁ + n₂ - 2)]
 *
 * Interpretation:
 * - |d| < 0.2: Negligible
 * - |d| < 0.5: Small
 * - |d| < 0.8: Medium
 * - |d| >= 0.8: Large
 */
export function cohensD(control: number[], treatment: number[]): number {
  const controlStats = calculateDescriptiveStats(control);
  const treatmentStats = calculateDescriptiveStats(treatment);

  return cohensDFromStats(
    controlStats.mean,
    controlStats.variance,
    controlStats.n,
    treatmentStats.mean,
    treatmentStats.variance,
    treatmentStats.n
  );
}

/**
 * Cohen's d from pre-computed statistics
 */
export function cohensDFromStats(
  mean1: number,
  var1: number,
  n1: number,
  mean2: number,
  var2: number,
  n2: number
): number {
  if (n1 < 2 || n2 < 2) return 0;

  // Pooled standard deviation
  const pooledVar =
    ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const pooledStd = Math.sqrt(pooledVar);

  if (pooledStd === 0) return 0;

  return (mean1 - mean2) / pooledStd;
}

/**
 * Interpret Cohen's d effect size
 */
export function interpretEffectSize(
  d: number
): 'NEGLIGIBLE' | 'SMALL' | 'MEDIUM' | 'LARGE' {
  const absD = Math.abs(d);
  if (absD < EFFECT_SIZE_THRESHOLDS.SMALL) return 'NEGLIGIBLE';
  if (absD < EFFECT_SIZE_THRESHOLDS.MEDIUM) return 'SMALL';
  if (absD < EFFECT_SIZE_THRESHOLDS.LARGE) return 'MEDIUM';
  return 'LARGE';
}

// =============================================================================
// Power Analysis
// =============================================================================

/**
 * Calculate required sample size per group for desired statistical power
 *
 * Uses formula: n = 2 * ((z_α + z_β) / d)²
 *
 * @param effectSize - Expected Cohen's d effect size
 * @param power - Desired statistical power (1 - β), default 0.8
 * @param alpha - Significance level (α), default 0.05
 * @returns Required sample size per group
 */
export function requiredSampleSize(
  effectSize: number,
  power: number = EXPERIMENT_DEFAULTS.DEFAULT_POWER,
  alpha: number = EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
): number {
  if (effectSize === 0) return Infinity;

  // Z-scores from normal distribution
  const zAlpha = normalDistributionQuantile(1 - alpha / 2);
  const zBeta = normalDistributionQuantile(power);

  const n = 2 * Math.pow((zAlpha + zBeta) / effectSize, 2);
  return Math.ceil(n);
}

/**
 * Calculate statistical power given sample size
 *
 * @param sampleSize - Sample size per group
 * @param effectSize - Expected Cohen's d effect size
 * @param alpha - Significance level (α), default 0.05
 * @returns Statistical power (probability of detecting true effect)
 */
export function calculatePower(
  sampleSize: number,
  effectSize: number,
  alpha: number = EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
): number {
  if (sampleSize < 2 || effectSize === 0) return 0;

  const zAlpha = normalDistributionQuantile(1 - alpha / 2);
  const se = Math.sqrt(2 / sampleSize);
  const noncentrality = effectSize / se;

  // Power = P(Z > z_α - δ/SE)
  const zBeta = zAlpha - noncentrality;
  return 1 - normalDistributionCDF(zBeta);
}

// =============================================================================
// Full Experiment Analysis
// =============================================================================

/**
 * Perform complete statistical analysis on experiment data
 */
export function analyzeExperiment(
  controlScores: number[],
  treatmentScores: number[],
  controlConversions?: number,
  treatmentConversions?: number,
  alpha: number = EXPERIMENT_DEFAULTS.DEFAULT_SIGNIFICANCE_LEVEL
): ExperimentAnalysis {
  const controlStats = calculateDescriptiveStats(controlScores);
  const treatmentStats = calculateDescriptiveStats(treatmentScores);

  // T-test for score comparison
  const tTest = welchTTestFromStats(
    controlStats.mean,
    controlStats.variance,
    controlStats.n,
    treatmentStats.mean,
    treatmentStats.variance,
    treatmentStats.n,
    alpha
  );

  // Effect size
  const effectSize = cohensDFromStats(
    controlStats.mean,
    controlStats.variance,
    controlStats.n,
    treatmentStats.mean,
    treatmentStats.variance,
    treatmentStats.n
  );

  const effectSizeInterpretation = interpretEffectSize(effectSize);

  // Chi-square test for conversions (if provided)
  let chiSquare: ChiSquareResult | undefined;
  if (
    controlConversions !== undefined &&
    treatmentConversions !== undefined
  ) {
    chiSquare = chiSquareTest(
      controlConversions,
      controlStats.n,
      treatmentConversions,
      treatmentStats.n,
      alpha
    );
  }

  // Determine winner and recommendation
  let winner: 'control' | 'treatment' | null = null;
  let recommendation: string;

  if (!tTest.isSignificant) {
    recommendation = `No statistically significant difference detected between control (M=${controlStats.mean.toFixed(1)}) and treatment (M=${treatmentStats.mean.toFixed(1)}) groups. The p-value of ${tTest.pValue.toFixed(4)} exceeds the significance threshold of ${alpha}.`;
  } else {
    winner = controlStats.mean > treatmentStats.mean ? 'control' : 'treatment';
    const better = winner === 'control' ? 'Control (manual)' : 'Treatment (AI)';
    const improvement = Math.abs(controlStats.mean - treatmentStats.mean);

    recommendation = `${better} scoring shows a statistically significant improvement of ${improvement.toFixed(1)} points (p=${tTest.pValue.toFixed(4)}). Effect size is ${effectSizeInterpretation.toLowerCase()} (d=${effectSize.toFixed(2)}). Recommend adopting ${better.toLowerCase()} scoring approach.`;
  }

  return {
    control: controlStats,
    treatment: treatmentStats,
    tTest,
    effectSize,
    effectSizeInterpretation,
    chiSquare,
    recommendation,
    winner,
  };
}

// =============================================================================
// Distribution Functions (Approximations)
// =============================================================================

/**
 * Approximate p-value from t-distribution
 * Uses Abramowitz and Stegun approximation
 */
function tDistributionPValue(t: number, df: number): number {
  // For large df, t-distribution approaches normal
  if (df > 100) {
    return 2 * (1 - normalDistributionCDF(Math.abs(t)));
  }

  // Beta function approximation for t-distribution CDF
  const x = df / (df + t * t);
  const beta = incompleteBeta(x, df / 2, 0.5);
  const p = 1 - beta;

  // Two-tailed p-value
  return 2 * Math.min(p, 1 - p);
}

/**
 * Approximate critical value from t-distribution
 */
function tDistributionCritical(alpha: number, df: number): number {
  // Newton-Raphson iteration to find t such that P(T > t) = alpha
  // Start with normal approximation
  let t = normalDistributionQuantile(1 - alpha);

  for (let i = 0; i < 10; i++) {
    const p = tDistributionPValue(t, df) / 2;
    const error = p - alpha;
    if (Math.abs(error) < 0.0001) break;

    // Approximate derivative for Newton step
    const dt = 0.001;
    const dp = (tDistributionPValue(t + dt, df) / 2 - p) / dt;
    if (Math.abs(dp) > 0.0001) {
      t -= error / dp;
    }
  }

  return Math.abs(t);
}

/**
 * Approximate p-value from chi-square distribution
 */
function chiSquareDistributionPValue(x: number, df: number): number {
  if (x <= 0) return 1;

  // Use incomplete gamma function: P(X > x) = 1 - P(X <= x) = 1 - Γ(df/2, x/2) / Γ(df/2)
  const p = incompleteGamma(df / 2, x / 2);
  return 1 - p;
}

/**
 * Standard normal distribution CDF approximation
 * Abramowitz and Stegun formula 26.2.17
 */
function normalDistributionCDF(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);

  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const t = 1 / (1 + p * z);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * (b1 * t + b2 * t2 + b3 * t3 + b4 * t4 + b5 * t5);

  return sign === 1 ? cdf : 1 - cdf;
}

/**
 * Inverse normal distribution (quantile function)
 * Beasley-Springer-Moro algorithm
 */
function normalDistributionQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.383577518672690e2,
    -3.066479806614716e1,
    2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

/**
 * Incomplete beta function approximation
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use continued fraction representation
  const bt =
    Math.exp(
      gammaLn(a + b) -
        gammaLn(a) -
        gammaLn(b) +
        a * Math.log(x) +
        b * Math.log(1 - x)
    );

  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaCF(x, a, b)) / a;
  } else {
    return 1 - (bt * betaCF(1 - x, b, a)) / b;
  }
}

/**
 * Continued fraction for incomplete beta function
 */
function betaCF(x: number, a: number, b: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  let h = d;

  for (let i = 1; i <= maxIterations; i++) {
    const m2 = 2 * i;

    // Even step
    let aa = (i * (b - i) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + i) * (a + b + i) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < epsilon) break;
  }

  return h;
}

/**
 * Log gamma function (Stirling's approximation)
 */
function gammaLn(x: number): number {
  const coefficients = [
    76.18009172947146,
    -86.5053203294168,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  for (let j = 0; j < 6; j++) {
    ser += coefficients[j] / ++y;
  }

  return -tmp + Math.log((2.5066282746310002 * ser) / x);
}

/**
 * Incomplete gamma function (regularized)
 */
function incompleteGamma(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;

  if (x < a + 1) {
    // Use series representation
    return gammaSeries(a, x);
  } else {
    // Use continued fraction
    return 1 - gammaCF(a, x);
  }
}

/**
 * Series expansion for incomplete gamma
 */
function gammaSeries(a: number, x: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let ap = a;
  let sum = 1 / a;
  let del = sum;

  for (let n = 1; n <= maxIterations; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * epsilon) break;
  }

  return sum * Math.exp(-x + a * Math.log(x) - gammaLn(a));
}

/**
 * Continued fraction for incomplete gamma
 */
function gammaCF(a: number, x: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let b = x + 1 - a;
  let c = 1 / epsilon;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i <= maxIterations; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = b + an / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < epsilon) break;
  }

  return h * Math.exp(-x + a * Math.log(x) - gammaLn(a));
}
