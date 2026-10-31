/**
 * Drift statistics (IFC-117, ADR-088). Pure functions, no I/O and no OTel imports.
 *
 * - Shared, fixed bin edges for the reference and current windows (per-window edges hide a
 *   pure shift: both windows normalise to the same histogram).
 * - Excess PSI: PSI with +0.5 additive smoothing, minus its expected value under no drift,
 *   (B-1)(1/n + 1/m). Raw PSI is ~0.5 under the null at n=25 / m=50, so a raw-PSI gate is vacuous.
 * - Two-sample Kolmogorov-Smirnov with the real sample sizes. The ECDFs are compared at distinct
 *   values only, so tied scores do not inflate D. The p-value is the asymptotic Kolmogorov
 *   series (Stephens' small-sample correction): conservative under ties, not an exact test.
 *
 * @module drift-stats
 * @task IFC-117
 */

export const DRIFT_BANDS = {
  psi: { low: 0.1, medium: 0.2, high: 0.25, critical: 0.5 },
  ks: { low: 0.1, medium: 0.2, high: 0.3, critical: 0.5 },
} as const;

/** Effect-size gate: a significant tick must also move PSI or D by at least this much. */
export const DRIFT_MIN_EFFECT = 0.1;

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

const SMOOTHING = 0.5;

/** `bins + 1` equal-width edges spanning [min, max]. */
export function fixedEdges(min: number, max: number, bins: number): number[] {
  const width = max > min ? (max - min) / bins : 1;
  return Array.from({ length: bins + 1 }, (_, i) => min + i * width);
}

/** Histogram counts against shared edges; values outside the range land in the end bins. */
export function binCounts(values: readonly number[], edges: readonly number[]): number[] {
  const bins = edges.length - 1;
  const counts = new Array<number>(bins).fill(0);
  const min = edges[0];
  const width = (edges[bins] - min) / bins || 1;
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
    counts[idx]++;
  }
  return counts;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Bias-corrected PSI of `current` against `reference` (both as counts over the same bins). */
export function excessPsi(reference: readonly number[], current: readonly number[]): number {
  const bins = reference.length;
  const n = sum(reference);
  const m = sum(current);
  if (n === 0 || m === 0) return 0;
  let psi = 0;
  for (let i = 0; i < bins; i++) {
    const p = (reference[i] + SMOOTHING) / (n + SMOOTHING * bins);
    const q = (current[i] + SMOOTHING) / (m + SMOOTHING * bins);
    psi += (q - p) * Math.log(q / p);
  }
  return psi - (bins - 1) * (1 / n + 1 / m);
}

/** Kolmogorov distribution tail Q(λ) = 2 Σ (-1)^(j-1) e^(-2 j² λ²), clamped to [0, 1]. */
export function kolmogorovQ(lambda: number): number {
  if (lambda < 0.2) return 1; // the series converges too slowly here; Q(0.2) is ~1 anyway
  let total = 0;
  for (let j = 1; j <= 100; j++) {
    const term = Math.exp(-2 * j * j * lambda * lambda);
    total += (j % 2 === 1 ? 1 : -1) * term;
    if (term < 1e-12) break;
  }
  return Math.min(1, Math.max(0, 2 * total));
}

/** Asymptotic p-value of the two-sample KS statistic `d` with sample sizes n and m. */
export function ksPValue(d: number, n: number, m: number): number {
  if (n === 0 || m === 0) return 1;
  const ne = (n * m) / (n + m);
  const root = Math.sqrt(ne);
  return kolmogorovQ((root + 0.12 + 0.11 / root) * d);
}

/** Two-sample KS on raw values, comparing the ECDFs at distinct values only (tie-aware). */
export function ksTwoSample(
  a: readonly number[],
  b: readonly number[]
): { d: number; pValue: number } {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  const n = x.length;
  const m = y.length;
  if (n === 0 || m === 0) return { d: 0, pValue: 1 };
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < n && j < m) {
    const v = Math.min(x[i], y[j]);
    while (i < n && x[i] === v) i++;
    while (j < m && y[j] === v) j++;
    d = Math.max(d, Math.abs(i / n - j / m));
  }
  return { d, pValue: ksPValue(d, n, m) };
}

/** KS on two histograms over the same bins (used for a pinned baseline that has no raw values). */
export function ksFromCounts(
  reference: readonly number[],
  current: readonly number[]
): { d: number; pValue: number } {
  const n = sum(reference);
  const m = sum(current);
  if (n === 0 || m === 0) return { d: 0, pValue: 1 };
  let cr = 0;
  let cc = 0;
  let d = 0;
  for (let i = 0; i < reference.length; i++) {
    cr += reference[i];
    cc += current[i];
    d = Math.max(d, Math.abs(cr / n - cc / m));
  }
  return { d, pValue: ksPValue(d, Math.round(n), Math.round(m)) };
}

function band(
  value: number,
  bands: { low: number; medium: number; high: number; critical: number }
): Severity {
  if (value >= bands.critical) return 'critical';
  if (value >= bands.high) return 'high';
  if (value >= bands.medium) return 'medium';
  if (value >= bands.low) return 'low';
  return 'none';
}

const ORDER: readonly Severity[] = ['none', 'low', 'medium', 'high', 'critical'];

/** Severity is the larger of the excess-PSI band and the KS-D band. */
export function severityFrom(effects: { excessPsi: number; d: number }): Severity {
  const a = band(effects.excessPsi, DRIFT_BANDS.psi);
  const b = band(effects.d, DRIFT_BANDS.ks);
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/** A tick is detected only when it is significant AND the effect is large enough to matter. */
export function isDetectedTick(
  stats: { pValue: number; excessPsi: number; d: number },
  alpha: number
): boolean {
  return (
    stats.pValue < alpha && (stats.excessPsi >= DRIFT_MIN_EFFECT || stats.d >= DRIFT_MIN_EFFECT)
  );
}

/** Display-only composite in [0, 1]; severity and detection never use it. */
export function compositeScore(effects: { excessPsi: number; d: number }): number {
  return (
    0.5 * Math.min(effects.d / DRIFT_BANDS.ks.high, 1) +
    0.5 * Math.min(Math.max(effects.excessPsi, 0) / DRIFT_BANDS.psi.high, 1)
  );
}
