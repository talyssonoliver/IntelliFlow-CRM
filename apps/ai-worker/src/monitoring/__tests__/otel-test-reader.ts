/**
 * In-memory OTel metric reader for IFC-117 tests.
 *
 * A pull-only reader (no timer, so no leaked handles) with DELTA temporality, so each
 * `collect()` returns only what was recorded since the previous one.
 */
import {
  AggregationTemporality,
  DataPointType,
  MeterProvider,
  MetricReader,
  type DataPoint,
  type Histogram,
} from '@opentelemetry/sdk-metrics';
import type { Attributes } from '@opentelemetry/api';

export class TestMetricReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.DELTA });
  }
  protected async onShutdown(): Promise<void> {}
  protected async onForceFlush(): Promise<void> {}
}

export interface CollectedPoint {
  attributes: Attributes;
  /** Counter / gauge value, or the histogram sum. */
  value: number;
  /** Histogram only. */
  count?: number;
  boundaries?: number[];
}

export interface CollectedMetric {
  name: string;
  unit: string;
  type: 'counter' | 'histogram' | 'gauge' | 'other';
  points: CollectedPoint[];
}

function toPoint(type: DataPointType, dp: DataPoint<unknown>): CollectedPoint {
  if (type === DataPointType.HISTOGRAM) {
    const h = dp.value as Histogram;
    return {
      attributes: dp.attributes,
      value: h.sum ?? 0,
      count: h.count,
      boundaries: h.buckets.boundaries,
    };
  }
  return { attributes: dp.attributes, value: dp.value as number };
}

function kindOf(type: DataPointType): CollectedMetric['type'] {
  if (type === DataPointType.SUM) return 'counter';
  if (type === DataPointType.HISTOGRAM) return 'histogram';
  if (type === DataPointType.GAUGE) return 'gauge';
  return 'other';
}

/** Collect every metric the reader has seen since the last collect. */
export async function collectMetrics(reader: TestMetricReader): Promise<CollectedMetric[]> {
  const { resourceMetrics, errors } = await reader.collect();
  if (errors.length > 0) throw new AggregateError(errors, 'metric collection failed');
  const out: CollectedMetric[] = [];
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const m of scope.metrics) {
      out.push({
        name: m.descriptor.name,
        unit: m.descriptor.unit,
        type: kindOf(m.dataPointType),
        points: (m.dataPoints as DataPoint<unknown>[]).map((dp) => toPoint(m.dataPointType, dp)),
      });
    }
  }
  return out;
}

export function findMetric(all: CollectedMetric[], name: string): CollectedMetric | undefined {
  return all.find((m) => m.name === name);
}

/** Points of `name` whose attributes include every key/value in `match`. */
export function pointsWhere(
  all: CollectedMetric[],
  name: string,
  match: Attributes = {}
): CollectedPoint[] {
  const metric = findMetric(all, name);
  if (!metric) return [];
  return metric.points.filter((p) =>
    Object.entries(match).every(([k, v]) => p.attributes[k] === v)
  );
}

/** Sum of the values (or histogram counts) of the matching points that are non-zero. */
export function total(all: CollectedMetric[], name: string, match: Attributes = {}): number {
  return pointsWhere(all, name, match).reduce((acc, p) => acc + (p.count ?? p.value), 0);
}

export function createTestProvider(): { provider: MeterProvider; reader: TestMetricReader } {
  const reader = new TestMetricReader();
  const provider = new MeterProvider({ readers: [reader] });
  return { provider, reader };
}
