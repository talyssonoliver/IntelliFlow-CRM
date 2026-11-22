/**
 * ROI normalisation for the AI monitoring Drift page (register #54).
 *
 * `aiMonitoring.getROIMetrics` returns `{ available, roi: { totalCost, totalValue,
 * netValue, roi, trendDirection, ... }, stats }`. The hook used to cast that wrapper
 * straight to ROIData, so `roi.roi` was the nested object and `.toFixed` crashed.
 * Values can also arrive as numeric strings (Decimal) or null.
 */
import type { ROIData } from './types';

/** Coerce a number, numeric string or Decimal-like to a finite number, else null. */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'object' && !(value instanceof Number)) {
    const s = (value as { toString?: () => string }).toString?.();
    if (typeof s !== 'string' || s === '[object Object]') return null;
    value = s;
  }
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isFinite(n) ? n : null;
}

const ROI_FIELDS = ['totalCost', 'totalValue', 'netValue', 'roi'] as const;

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Accepts the wrapped API payload or an already-flat ROI object. Null when unusable. */
export function normalizeROI(raw: unknown): ROIData | null {
  if (!isPlainRecord(raw)) return null;
  // Wrapper only when the nested value is itself a record carrying ROI fields.
  const nested = raw.roi;
  const inner = isPlainRecord(nested) && ROI_FIELDS.some((k) => k in nested) ? nested : raw;
  if (!ROI_FIELDS.some((k) => toFiniteNumber(inner[k]) !== null)) return null;
  const totalCost = toFiniteNumber(inner.totalCost) ?? 0;
  const totalValue = toFiniteNumber(inner.totalValue) ?? 0;
  return {
    totalCost,
    totalValue,
    netValue: toFiniteNumber(inner.netValue) ?? totalValue - totalCost,
    roi: toFiniteNumber(inner.roi),
    trendDirection: typeof inner.trendDirection === 'string' ? inner.trendDirection : 'stable',
  };
}
