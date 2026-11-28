/**
 * Period comparison for the Analytics workspace (owner 26/11, Analytics redesign: "Historical and
 * comparative ... Support date ranges, previous-period comparison"). Pure functions, so every view
 * compares the same way and the numbers are testable.
 */

export interface DateRange {
  /** ISO datetime */
  startDate: string;
  /** ISO datetime */
  endDate: string;
}

export type PeriodKey = '7d' | '30d' | '90d' | 'ytd';

/** The same length of time immediately before `range` (ending where it starts). */
export function previousRange(range: DateRange): DateRange {
  const start = new Date(range.startDate).getTime();
  const end = new Date(range.endDate).getTime();
  const length = Math.max(0, end - start);
  return {
    startDate: new Date(start - length).toISOString(),
    endDate: new Date(start).toISOString(),
  };
}

/**
 * Trend granularity that shows the shape of the period (redesign audit: "A 30-day view uses
 * monthly revenue granularity, obscuring short-term trends"). The API allows day up to 31 days
 * and week up to 365.
 */
export function trendGranularity(period: PeriodKey): 'day' | 'week' | 'month' {
  if (period === '7d' || period === '30d') return 'day';
  return 'week';
}

export type Better = 'higher' | 'lower';

export interface Comparison {
  current: number;
  previous: number;
  /** current - previous, in the metric's own unit */
  delta: number;
  /** Relative change in %, or null when the previous value is 0 (no base to compare with). */
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
  /** Whether the change is good for the business, given which way is better. */
  tone: 'good' | 'bad' | 'neutral';
}

export function compare(current: number, previous: number, better: Better = 'higher'): Comparison {
  const delta = current - previous;
  const percent = previous === 0 ? null : (delta / Math.abs(previous)) * 100;
  let direction: Comparison['direction'] = 'flat';
  if (delta > 0) direction = 'up';
  else if (delta < 0) direction = 'down';
  let tone: Comparison['tone'] = 'neutral';
  if (direction !== 'flat') {
    const improved = better === 'higher' ? direction === 'up' : direction === 'down';
    tone = improved ? 'good' : 'bad';
  }
  return { current, previous, delta, percent, direction, tone };
}

export interface MetricForChanges {
  label: string;
  comparison: Comparison;
  /** 'pp' for rates in percentage points; '%' to report relative change. */
  unit: 'pp' | '%';
  /** Formats a value of this metric for the evidence line. */
  format: (value: number) => string;
}

export interface MaterialChange {
  label: string;
  summary: string;
  evidence: string;
  tone: 'good' | 'bad';
}

/** A change is material at 10% relative change, or 5 percentage points for rates. */
const MATERIAL_PERCENT = 10;
const MATERIAL_POINTS = 5;

/** A move from a zero base has no percentage, but it is a change (codex 28/11: "£0 to £50,000"
 *  was reported as nothing moving). It ranks first, as the largest relative change there is. */
function fromZero(m: MetricForChanges): boolean {
  return m.unit === '%' && m.comparison.percent === null && m.comparison.direction !== 'flat';
}

function size(m: MetricForChanges): number {
  if (m.unit === 'pp') return Math.abs(m.comparison.delta);
  if (fromZero(m)) return Number.POSITIVE_INFINITY;
  return Math.abs(m.comparison.percent ?? 0);
}

function isMaterial(m: MetricForChanges): boolean {
  if (m.comparison.direction === 'flat') return false;
  if (m.unit === 'pp') return Math.abs(m.comparison.delta) >= MATERIAL_POINTS;
  if (fromZero(m)) return true;
  return m.comparison.percent !== null && Math.abs(m.comparison.percent) >= MATERIAL_PERCENT;
}

/**
 * The biggest movements against the previous period, largest first. Every line carries both
 * figures as its evidence: computed from verified metrics, never invented (redesign: "AI should
 * interpret verified metrics, not invent or independently calculate them").
 */
export function materialChanges(metrics: readonly MetricForChanges[], limit = 3): MaterialChange[] {
  return metrics
    .filter(isMaterial)
    .sort((a, b) => size(b) - size(a))
    .slice(0, limit)
    .map((m) => {
      const verb = m.comparison.direction === 'up' ? 'rose' : 'fell';
      const amount =
        m.unit === 'pp'
          ? `${Math.abs(Math.round(m.comparison.delta * 10) / 10)} pp`
          : `${Math.abs(Math.round(m.comparison.percent ?? 0))}%`;
      const summary = fromZero(m)
        ? `${m.label} ${verb} from ${m.format(0)} in the previous period`
        : `${m.label} ${verb} ${amount} against the previous period`;
      return {
        label: m.label,
        summary,
        evidence: `${m.format(m.comparison.current)} now, ${m.format(m.comparison.previous)} before`,
        tone: m.comparison.tone === 'good' ? 'good' : 'bad',
      };
    });
}
