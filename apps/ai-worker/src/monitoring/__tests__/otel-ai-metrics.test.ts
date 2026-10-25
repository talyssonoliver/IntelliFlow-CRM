/**
 * IFC-117: OTel recording facade — names, units, buckets, the attribute allowlist, the
 * error classifier, cardinality bounds and "recorders never throw".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import { MODEL_PRICING } from '../../config/ai.config';
import {
  AI_METRIC_DEFINITIONS,
  __resetAiMetricsForTests,
  __setMeterForTests,
  classifyError,
  normalizeModel,
  recordConfidence,
  recordCost,
  recordDriftTick,
  recordEstimatedValue,
  recordHallucination,
  recordInference,
  recordRetrainingTrigger,
  registerAiMetrics,
  seededSeriesBound,
} from '../otel-ai-metrics';
import {
  CHAIN_IDS,
  HALLUCINATION_TYPES,
  VALUE_TYPES,
  type DriftTickResult,
} from '../otel-ai-types';
import type { HallucinationType } from '../hallucination-checker';
import type { ValueType } from '../roi-tracker';
import {
  collectMetrics,
  createTestProvider,
  findMetric,
  pointsWhere,
  total,
  type CollectedMetric,
  type TestMetricReader,
} from './otel-test-reader';

// Built at runtime so no literal in the repo looks like a credential.
const CANARY = ['CANARY', 'MARKER', 'a'.repeat(8)].join('_');

let provider: MeterProvider;
let reader: TestMetricReader;

beforeEach(() => {
  ({ provider, reader } = createTestProvider());
  __setMeterForTests(provider.getMeter('ifc-117-test'));
});

afterEach(async () => {
  __setMeterForTests(null);
  __resetAiMetricsForTests();
  await provider.shutdown();
});

function attributeValues(all: CollectedMetric[]): string[] {
  return all.flatMap((m) => m.points.flatMap((p) => Object.values(p.attributes).map(String)));
}

function seriesCount(all: CollectedMetric[]): number {
  return all.reduce((acc, m) => acc + m.points.length, 0);
}

function drift(overrides: Partial<DriftTickResult> = {}): DriftTickResult {
  return {
    model: 'scoring-free',
    metric: 'score_distribution',
    status: 'evaluated',
    detectedTick: false,
    onset: false,
    inEvent: false,
    severity: 'none',
    driftScore: 0.1,
    pValue: 0.5,
    ...overrides,
  };
}

describe('instrument definitions', () => {
  it('declares exactly the spec instruments with their types and units', () => {
    // Written out from the spec's instrument table on purpose, so a wrong definition fails here.
    const spec: Array<[string, string, string]> = [
      ['intelliflow.ai.inference.latency', 'histogram', 'ms'],
      ['intelliflow.ai.inference.count', 'counter', '1'],
      ['intelliflow.ai.confidence', 'histogram', ''],
      ['intelliflow.ai.cost.usd', 'counter', ''],
      ['intelliflow.ai.value.estimated.usd', 'counter', ''],
      ['intelliflow.ai.hallucination.checks', 'counter', '1'],
      ['intelliflow.ai.hallucination.detected', 'counter', '1'],
      ['intelliflow.ai.hallucination.types', 'counter', '1'],
      ['intelliflow.ai.hallucination.skipped', 'counter', '1'],
      ['intelliflow.ai.drift.score', 'gauge', ''],
      ['intelliflow.ai.drift.detections', 'counter', '1'],
      ['intelliflow.ai.drift.checks', 'counter', '1'],
      ['intelliflow.ai.drift.last_check', 'gauge', ''],
      ['intelliflow.ai.retraining.triggers', 'counter', '1'],
    ];
    const declared = AI_METRIC_DEFINITIONS.map((d) => [d.name, d.type, d.unit]);
    expect(declared.sort()).toEqual(spec.sort());
  });

  // The tools asset test (ai-monitoring-assets.test.ts) checks dashboards and rules against
  // AI_METRIC_DEFINITIONS; this proves those definitions are what the recorders really emit.
  it('emits exactly the declared instruments (name, type, unit) once every recorder has run', async () => {
    recordInference({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: 'success',
      latencyMs: 10,
    });
    recordConfidence({ model: 'scoring-free', chain: 'lead_scoring', confidence: 0.5 });
    recordCost({ model: 'scoring-free', chain: 'lead_scoring', usd: 0.001 });
    recordEstimatedValue({ chain: 'lead_scoring', valueType: 'lead_scored', usd: 0.5 });
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: { status: 'checked', hallucinated: true, types: ['fabricated_entity'] },
    });
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: { status: 'skipped', reason: 'too_short' },
    });
    recordDriftTick([drift({ detectedTick: true, onset: true, inEvent: true, severity: 'high' })]);
    recordRetrainingTrigger({ urgency: 'high' });
    const collected = (await collectMetrics(reader))
      .map((m) => ({ name: m.name, type: m.type, unit: m.unit }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const declared = AI_METRIC_DEFINITIONS.map((d) => ({
      name: d.name,
      type: d.type,
      unit: d.unit,
    })).sort((a, b) => a.name.localeCompare(b.name));
    expect(collected).toEqual(declared);
  });

  it('records latency into the explicit bucket boundaries, including 2000 ms', async () => {
    recordInference({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: 'success',
      latencyMs: 1999,
    });
    const all = await collectMetrics(reader);
    const [point] = pointsWhere(all, 'intelliflow.ai.inference.latency');
    expect(point.boundaries).toEqual([
      50, 100, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000, 30000,
    ]);
    expect(findMetric(all, 'intelliflow.ai.inference.latency')?.unit).toBe('ms');
  });
});

describe('model normalisation', () => {
  it.each(Object.keys(MODEL_PRICING))('keeps the pricing key %s', (key) => {
    expect(normalizeModel(key)).toBe(key);
  });

  it.each(['unknown', 'default', '', 'x:free', '__proto__', 'constructor', 'toString', 'gpt-9000'])(
    'maps %j to other',
    (raw) => {
      expect(normalizeModel(raw)).toBe('other');
    }
  );

  it('maps undefined and non-strings to other', () => {
    expect(normalizeModel(undefined)).toBe('other');
    expect(normalizeModel(42 as unknown as string)).toBe('other');
  });

  it('maps a dated gateway model name through servedPricingKey', () => {
    // claude-haiku-4-5 is a served deployment; providers append a version date.
    const mapped = normalizeModel('claude-haiku-4-5-20251001');
    expect(mapped).not.toBe('other');
    expect(Object.hasOwn(MODEL_PRICING, mapped)).toBe(true);
  });
});

describe('attribute allowlist', () => {
  it('maps unknown closed-set values to other/unknown', async () => {
    recordInference({
      model: 'scoring-free',
      chain: 'nope' as never,
      outcome: 'success',
      latencyMs: 1,
    });
    recordEstimatedValue({ chain: 'lead_scoring', valueType: 'made_up', usd: 1 });
    recordRetrainingTrigger({ urgency: 'apocalyptic' });
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: {
        status: 'checked',
        hallucinated: true,
        types: ['invented_type' as HallucinationType],
      },
    });
    recordDriftTick([
      drift({ metric: 'mystery', status: 'weird' as never, onset: true, severity: 'odd' as never }),
    ]);
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: { status: 'skipped', reason: 'made_up_reason' as never },
    });
    const all = await collectMetrics(reader);
    expect(
      pointsWhere(all, 'intelliflow.ai.hallucination.skipped', { reason: 'other' })
    ).toHaveLength(1);
    expect(pointsWhere(all, 'intelliflow.ai.inference.count', { chain: 'unknown' })).toHaveLength(
      1
    );
    expect(
      pointsWhere(all, 'intelliflow.ai.value.estimated.usd', { value_type: 'other' })
    ).toHaveLength(1);
    expect(
      pointsWhere(all, 'intelliflow.ai.retraining.triggers', { urgency: 'other' })
    ).toHaveLength(1);
    expect(
      pointsWhere(all, 'intelliflow.ai.hallucination.types', { hallucination_type: 'other' })
    ).toHaveLength(1);
    expect(pointsWhere(all, 'intelliflow.ai.drift.checks', { status: 'other' })).toHaveLength(1);
    expect(
      pointsWhere(all, 'intelliflow.ai.drift.detections', { metric: 'other', severity: 'other' })
    ).toHaveLength(1);
  });

  it('allowlist arrays are exhaustive against their unions', () => {
    const hallucinationTypes: Record<HallucinationType, true> = {
      factual_error: true,
      fabricated_entity: true,
      inconsistent_logic: true,
      unsupported_claim: true,
      temporal_error: true,
      numerical_error: true,
      attribution_error: true,
      context_drift: true,
    };
    expect([...HALLUCINATION_TYPES].sort()).toEqual(Object.keys(hallucinationTypes).sort());
    const valueTypes = VALUE_TYPES satisfies readonly ValueType[];
    expect(new Set(valueTypes).size).toBe(VALUE_TYPES.length);
    expect(CHAIN_IDS).toEqual(['lead_scoring', 'auto_response', 'unknown']);
  });
});

describe('error classification', () => {
  class FooTenant123Error extends Error {}

  it.each([
    [Object.assign(new Error('request timed out'), { name: 'TimeoutError' }), 'timeout'],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'timeout'],
    [Object.assign(new Error('too many'), { status: 429 }), 'rate_limited'],
    [Object.assign(new Error('x'), { name: 'ZodError' }), 'parse'],
    [new SyntaxError('Unexpected token'), 'parse'],
    [new FooTenant123Error('tenant thing'), 'other'],
    ['a string throw', 'other'],
    [{ message: CANARY }, 'other'],
    [undefined, 'other'],
  ])('classifies %o as %s', (err, expected) => {
    expect(classifyError(err)).toBe(expected);
  });

  it('never puts the error text or class name into an attribute', async () => {
    recordInference({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: 'error',
      latencyMs: 5,
      error: new FooTenant123Error(CANARY),
    });
    recordInference({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: 'error',
      latencyMs: 5,
      error: { message: CANARY },
    });
    const all = await collectMetrics(reader);
    const values = attributeValues(all).join('|');
    expect(values).not.toContain(CANARY);
    expect(values).not.toContain('FooTenant123Error');
    expect(
      pointsWhere(all, 'intelliflow.ai.inference.count', {
        outcome: 'error',
        error_class: 'other',
      })[0].value
    ).toBe(2);
  });
});

describe('cardinality', () => {
  it('stays bounded when fed 1,000 random strings in every attribute position', async () => {
    for (let i = 0; i < 1000; i++) {
      const s = `rnd-${i}-${(i * 7919) % 104729}`;
      recordInference({ model: s, chain: s as never, outcome: 'success', latencyMs: i });
      recordCost({ model: s, chain: s as never, usd: 0.001 });
      recordEstimatedValue({ chain: s as never, valueType: s, usd: 0.5 });
      recordHallucination({
        model: s,
        chain: s as never,
        outcome: { status: 'checked', hallucinated: true, types: [s as HallucinationType] },
      });
      recordRetrainingTrigger({ urgency: s });
      recordInference({
        model: s,
        chain: s as never,
        outcome: s as never,
        latencyMs: i,
        error: Object.assign(new Error(s), { name: s }),
      });
      recordInference({
        model: s,
        chain: s as never,
        outcome: 'error',
        latencyMs: i,
        error: Object.assign(new Error(s), { name: s, status: s }),
      });
      recordConfidence({ model: s, chain: s as never, confidence: 0.5 });
      recordHallucination({
        model: s,
        chain: s as never,
        outcome: { status: 'skipped', reason: s as never },
      });
      recordDriftTick([
        drift({
          model: s,
          metric: s,
          status: s as never,
          severity: s as never,
          detectedTick: true,
          onset: true,
          inEvent: true,
        }),
      ]);
    }
    const all = await collectMetrics(reader);
    // Every random string collapses to a closed-set value: inference splits only by outcome
    // (success, an unknown outcome as other, error) and nothing else gains a series.
    expect(seriesCount(all)).toBeLessThanOrEqual(seededSeriesBound());
    for (const m of all) expect(m.points.length).toBeLessThanOrEqual(3);
    expect(pointsWhere(all, 'intelliflow.ai.inference.count')).toHaveLength(3);
    expect(attributeValues(all).some((v) => v.startsWith('rnd-'))).toBe(false);
  });

  it('pre-seeds exactly the computed bound of series and no more', async () => {
    registerAiMetrics();
    const all = await collectMetrics(reader);
    expect(seriesCount(all)).toBe(seededSeriesBound());
    const models = Object.keys(MODEL_PRICING).length + 1;
    expect(total(all, 'intelliflow.ai.drift.detections')).toBe(0);
    expect(pointsWhere(all, 'intelliflow.ai.drift.detections')).toHaveLength(models * 2 * 2);
  });

  it('registerAiMetrics is idempotent', async () => {
    registerAiMetrics();
    registerAiMetrics();
    const all = await collectMetrics(reader);
    expect(seriesCount(all)).toBe(seededSeriesBound());
  });
});

describe('recorder semantics', () => {
  it('records confidence only for a finite number in [0, 1]', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1, '0.5', undefined, null]) {
      recordConfidence({ model: 'scoring-free', chain: 'lead_scoring', confidence: bad });
    }
    recordConfidence({ model: 'scoring-free', chain: 'lead_scoring', confidence: 0.85 });
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.confidence')).toBe(1);
  });

  it('records cost only for a known model, including zero', async () => {
    recordCost({ model: 'not-a-model', chain: 'lead_scoring', usd: 0.5 });
    recordCost({ model: 'scoring-free', chain: 'lead_scoring', usd: 0 });
    recordCost({ model: 'scoring-free', chain: 'lead_scoring', usd: 0.00014 });
    recordCost({ model: 'scoring-free', chain: 'lead_scoring', usd: Number.NaN });
    const all = await collectMetrics(reader);
    const points = pointsWhere(all, 'intelliflow.ai.cost.usd');
    expect(points).toHaveLength(1);
    expect(points[0].attributes).toEqual({ model: 'scoring-free', chain: 'lead_scoring' });
    expect(points[0].value).toBeCloseTo(0.00014, 9);
  });

  it('counts hallucination checks, detections and types consistently', async () => {
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: {
        status: 'checked',
        hallucinated: true,
        types: ['fabricated_entity', 'fabricated_entity'],
      },
    });
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: { status: 'checked', hallucinated: false, types: ['context_drift'] },
    });
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: { status: 'skipped', reason: 'too_short' },
    });
    recordHallucination({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: { status: 'error' },
    });
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.hallucination.checks')).toBe(2);
    expect(total(all, 'intelliflow.ai.hallucination.detected')).toBe(1);
    // Types only when hallucinated, deduplicated per check.
    expect(pointsWhere(all, 'intelliflow.ai.hallucination.types')).toEqual([
      expect.objectContaining({
        value: 1,
        attributes: expect.objectContaining({ hallucination_type: 'fabricated_entity' }),
      }),
    ]);
    expect(total(all, 'intelliflow.ai.hallucination.skipped', { reason: 'too_short' })).toBe(1);
    expect(total(all, 'intelliflow.ai.hallucination.skipped', { reason: 'error' })).toBe(1);
  });

  it('counts drift checks per tick and detections only at event onset', async () => {
    recordDriftTick([
      drift({ status: 'insufficient_data' }),
      drift({
        status: 'evaluated',
        detectedTick: true,
        onset: true,
        inEvent: true,
        severity: 'high',
        driftScore: 0.8,
      }),
      drift({
        metric: 'confidence_level',
        status: 'evaluated',
        detectedTick: true,
        inEvent: true,
        severity: 'high',
      }),
    ]);
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.drift.checks', { status: 'insufficient_data' })).toBe(1);
    expect(total(all, 'intelliflow.ai.drift.checks', { status: 'evaluated' })).toBe(2);
    expect(total(all, 'intelliflow.ai.drift.detections')).toBe(1);
    expect(
      pointsWhere(all, 'intelliflow.ai.drift.score', {
        model: 'scoring-free',
        metric: 'score_distribution',
      })[0].value
    ).toBeCloseTo(0.8);
  });

  it('observes last_check only after the first tick, including an insufficient-data tick', async () => {
    registerAiMetrics();
    let all = await collectMetrics(reader);
    expect(pointsWhere(all, 'intelliflow.ai.drift.last_check')).toHaveLength(0);
    recordDriftTick([drift({ status: 'insufficient_data' })]);
    all = await collectMetrics(reader);
    const [lastCheck] = pointsWhere(all, 'intelliflow.ai.drift.last_check');
    expect(lastCheck.value).toBeGreaterThan(1_700_000_000);
  });

  it('records the retraining trigger with a clamped urgency', async () => {
    recordRetrainingTrigger({ urgency: 'high' });
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.retraining.triggers', { urgency: 'high' })).toBe(1);
  });
});

describe('recorders never throw', () => {
  it('swallows instrument failures', () => {
    const throwing = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error('boom');
        },
      }
    );
    __setMeterForTests(throwing as never);
    expect(() => registerAiMetrics()).not.toThrow();
    expect(() =>
      recordInference({
        model: 'scoring-free',
        chain: 'lead_scoring',
        outcome: 'success',
        latencyMs: 1,
      })
    ).not.toThrow();
    expect(() =>
      recordConfidence({ model: 'x', chain: 'lead_scoring', confidence: 0.5 })
    ).not.toThrow();
    expect(() =>
      recordCost({ model: 'scoring-free', chain: 'lead_scoring', usd: 1 })
    ).not.toThrow();
    expect(() =>
      recordEstimatedValue({ chain: 'lead_scoring', valueType: 'lead_scored', usd: 1 })
    ).not.toThrow();
    expect(() =>
      recordHallucination({ model: 'x', chain: 'lead_scoring', outcome: { status: 'error' } })
    ).not.toThrow();
    expect(() => recordDriftTick([drift()])).not.toThrow();
    expect(() => recordRetrainingTrigger({ urgency: 'low' })).not.toThrow();
  });

  it('swallows add/record failures on instruments that were created fine', () => {
    const throwingInstrument = {
      add: () => {
        throw new Error('add boom');
      },
      record: () => {
        throw new Error('record boom');
      },
    };
    const meter = {
      createCounter: () => throwingInstrument,
      createHistogram: () => throwingInstrument,
      createObservableGauge: () => ({ addCallback: () => {}, removeCallback: () => {} }),
    };
    __setMeterForTests(meter as never);
    expect(() => registerAiMetrics()).not.toThrow();
    expect(() =>
      recordInference({
        model: 'scoring-free',
        chain: 'lead_scoring',
        outcome: 'error',
        latencyMs: 1,
      })
    ).not.toThrow();
    expect(() =>
      recordConfidence({ model: 'scoring-free', chain: 'lead_scoring', confidence: 0.5 })
    ).not.toThrow();
    expect(() =>
      recordCost({ model: 'scoring-free', chain: 'lead_scoring', usd: 1 })
    ).not.toThrow();
    expect(() =>
      recordEstimatedValue({ chain: 'lead_scoring', valueType: 'lead_scored', usd: 1 })
    ).not.toThrow();
    expect(() =>
      recordHallucination({
        model: 'scoring-free',
        chain: 'lead_scoring',
        outcome: { status: 'checked', hallucinated: true, types: ['factual_error'] },
      })
    ).not.toThrow();
    expect(() => recordDriftTick([drift({ onset: true })])).not.toThrow();
    expect(() => recordRetrainingTrigger({ urgency: 'low' })).not.toThrow();
  });

  it('gauge callbacks whose observe throws do not abort collection of other instruments', async () => {
    const real = provider.getMeter('ifc-117-throwing-gauges');
    const throwingResult = {
      observe: () => {
        throw new Error('observe boom');
      },
    };
    const meter = new Proxy(real, {
      get(target, prop) {
        if (prop === 'createObservableGauge') {
          return (name: string, options: object) => {
            const gauge = target.createObservableGauge(name, options);
            return {
              addCallback: (cb: (r: unknown) => void) =>
                gauge.addCallback(() => cb(throwingResult)),
              removeCallback: () => {},
            };
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    __setMeterForTests(meter as never);
    recordDriftTick([drift({ driftScore: 0.4 })]); // populates both gauges' snapshots
    recordInference({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: 'success',
      latencyMs: 3,
    });
    const all = await collectMetrics(reader); // throws if any callback error escaped
    expect(total(all, 'intelliflow.ai.inference.count')).toBe(1);
    expect(total(all, 'intelliflow.ai.drift.checks')).toBe(1);
  });

  it('a throwing gauge snapshot does not abort collection', async () => {
    recordInference({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: 'success',
      latencyMs: 3,
    });
    recordDriftTick([
      drift({
        model: {
          toString: () => {
            throw new Error('bad');
          },
        } as never,
      }),
    ]);
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.inference.count')).toBe(1);
  });
});
