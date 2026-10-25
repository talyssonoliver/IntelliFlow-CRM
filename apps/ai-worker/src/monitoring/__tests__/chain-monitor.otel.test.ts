/**
 * IFC-117: what withMonitoring records on the OTel facade (the call-site semantics).
 * Real latency/drift/ROI instances; the hallucination checker is a stub so each outcome is exact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import { withMonitoring, type ChainMonitorConfig, type MonitoringContext } from '../chain-monitor';
import { DriftDetector, defaultDriftConfig } from '../drift-detector';
import {
  HallucinationChecker,
  defaultHallucinationConfig,
  type HallucinationResult,
} from '../hallucination-checker';
import { ROITracker, defaultROIConfig } from '../roi-tracker';
import { LatencyMonitor, defaultLatencyConfig } from '../latency-monitor';
import { __resetAiMetricsForTests, __setMeterForTests } from '../otel-ai-metrics';
import {
  collectMetrics,
  createTestProvider,
  pointsWhere,
  total,
  type TestMetricReader,
} from './otel-test-reader';

let provider: MeterProvider;
let reader: TestMetricReader;
let config: ChainMonitorConfig;
let checkOutput: ReturnType<typeof vi.fn>;

function checkerResult(overrides: Partial<HallucinationResult>): HallucinationResult {
  return {
    id: 'x',
    timestamp: new Date(),
    model: 'scoring-free',
    inputContext: '',
    output: '',
    hallucinated: false,
    confidence: 0,
    hallucinationTypes: [],
    evidence: [],
    groundTruthSources: [],
    score: 0,
    ...overrides,
  };
}

const FULL_CONTEXT: MonitoringContext = {
  modelName: 'scoring-free',
  chain: 'lead_scoring',
  valueType: 'lead_scored',
  inputContext: 'Lead: Jane Example, VP Sales at Example Corp, inbound demo request',
  extractText: () => 'Engagement: inbound demo request from a VP at Example Corp',
  getUsage: () => ({ inputTokens: 2000, outputTokens: 500, model: 'scoring-free' }),
};

beforeEach(() => {
  ({ provider, reader } = createTestProvider());
  __setMeterForTests(provider.getMeter('ifc-117-chain-monitor-test'));
  const hallucinationChecker = new HallucinationChecker(defaultHallucinationConfig);
  checkOutput = vi.fn(async () => checkerResult({}));
  hallucinationChecker.checkOutput = checkOutput as unknown as HallucinationChecker['checkOutput'];
  config = {
    driftDetector: new DriftDetector(defaultDriftConfig),
    hallucinationChecker,
    roiTracker: new ROITracker(defaultROIConfig),
    latencyMonitor: new LatencyMonitor(defaultLatencyConfig),
    latencyThresholdMs: 2000,
  };
});

afterEach(async () => {
  __setMeterForTests(null);
  __resetAiMetricsForTests();
  await provider.shutdown();
});

describe('success path', () => {
  it('records inference, confidence, cost and the exact tracker value', async () => {
    const recordValue = vi.spyOn(config.roiTracker, 'recordValueByType');
    await withMonitoring(async () => ({ score: 72, confidence: 0.85 }), config, FULL_CONTEXT);
    const all = await collectMetrics(reader);
    const success = { model: 'scoring-free', chain: 'lead_scoring', outcome: 'success' };
    expect(total(all, 'intelliflow.ai.inference.count', success)).toBe(1);
    expect(total(all, 'intelliflow.ai.inference.latency', success)).toBe(1);
    expect(total(all, 'intelliflow.ai.confidence')).toBe(1);
    expect(pointsWhere(all, 'intelliflow.ai.cost.usd')[0].value).toBeCloseTo(0.00014, 9);
    const booked = recordValue.mock.results[0].value as { estimatedValue: number };
    expect(
      pointsWhere(all, 'intelliflow.ai.value.estimated.usd', { value_type: 'lead_scored' })[0].value
    ).toBe(booked.estimatedValue);
  });

  it('does not record a confidence the result does not carry (no default 1)', async () => {
    await withMonitoring(async () => ({ score: 72 }), config, FULL_CONTEXT);
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.confidence')).toBe(0);
  });

  it('records no cost when usage was not captured', async () => {
    await withMonitoring(async () => ({ score: 72 }), config, {
      ...FULL_CONTEXT,
      getUsage: () => null,
    });
    const all = await collectMetrics(reader);
    expect(pointsWhere(all, 'intelliflow.ai.cost.usd')).toHaveLength(0);
  });

  it('books no value without an explicit valueType', async () => {
    const recordValue = vi.spyOn(config.roiTracker, 'recordValueByType');
    await withMonitoring(async () => ({ score: 72 }), config, {
      ...FULL_CONTEXT,
      valueType: undefined,
    });
    const all = await collectMetrics(reader);
    expect(recordValue).not.toHaveBeenCalled();
    expect(pointsWhere(all, 'intelliflow.ai.value.estimated.usd')).toHaveLength(0);
  });

  it('normalises the 0-100 score by dividing by 100, including a score of 1', async () => {
    const recordSample = vi.spyOn(config.driftDetector, 'recordSample');
    await withMonitoring(async () => ({ score: 1 }), config, FULL_CONTEXT);
    await withMonitoring(async () => ({ score: 72 }), config, FULL_CONTEXT);
    const scores = recordSample.mock.calls
      .map(([s]) => s)
      .filter((s) => s.metric === 'score_distribution')
      .map((s) => s.value);
    expect(scores).toEqual([0.01, 0.72]);
  });

  it('records the confidence distribution as its own drift metric', async () => {
    const recordSample = vi.spyOn(config.driftDetector, 'recordSample');
    await withMonitoring(async () => ({ score: 72, confidence: 0.85 }), config, FULL_CONTEXT);
    expect(recordSample.mock.calls.map(([s]) => s.metric).sort()).toEqual([
      'confidence_level',
      'score_distribution',
    ]);
  });

  it('records no drift sample when recordDrift is false', async () => {
    const recordSample = vi.spyOn(config.driftDetector, 'recordSample');
    await withMonitoring(async () => ({ score: 72, confidence: 0.85 }), config, {
      ...FULL_CONTEXT,
      recordDrift: false,
    });
    expect(recordSample).not.toHaveBeenCalled();
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.inference.count')).toBe(1);
  });
});

describe('hallucination outcome', () => {
  it('checked + hallucinated: checks, detected and types', async () => {
    checkOutput.mockResolvedValueOnce(
      checkerResult({ hallucinated: true, hallucinationTypes: ['fabricated_entity'] })
    );
    const monitored = await withMonitoring(async () => ({ score: 72 }), config, FULL_CONTEXT);
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.hallucination.checks')).toBe(1);
    expect(total(all, 'intelliflow.ai.hallucination.detected')).toBe(1);
    expect(
      total(all, 'intelliflow.ai.hallucination.types', { hallucination_type: 'fabricated_entity' })
    ).toBe(1);
    expect(monitored.metrics.hallucinated).toBe(true);
    expect(monitored.metrics.hallucinationFlags).toEqual(['fabricated_entity']);
  });

  it('checked, not hallucinated but with flags: checks only, no types', async () => {
    checkOutput.mockResolvedValueOnce(
      checkerResult({ hallucinated: false, hallucinationTypes: ['context_drift'] })
    );
    const monitored = await withMonitoring(async () => ({ score: 72 }), config, FULL_CONTEXT);
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.hallucination.checks')).toBe(1);
    expect(total(all, 'intelliflow.ai.hallucination.detected')).toBe(0);
    expect(pointsWhere(all, 'intelliflow.ai.hallucination.types')).toHaveLength(0);
    expect(monitored.metrics.hallucinated).toBe(false);
  });

  it.each([
    ['no_context', { inputContext: '' }],
    ['no_text', { extractText: () => null }],
    ['too_short', { extractText: () => 'short' }],
  ] as const)('skip reason %s records skipped only', async (reason, override) => {
    const monitored = await withMonitoring(async () => ({ score: 72 }), config, {
      ...FULL_CONTEXT,
      ...override,
    });
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.hallucination.checks')).toBe(0);
    expect(total(all, 'intelliflow.ai.hallucination.skipped', { reason })).toBe(1);
    expect(monitored.metrics.hallucinated).toBeNull();
  });

  it('a checker error records skipped{reason:error} and does not fail the chain', async () => {
    checkOutput.mockRejectedValueOnce(new Error('checker broke'));
    const monitored = await withMonitoring(async () => ({ score: 72 }), config, FULL_CONTEXT);
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.hallucination.skipped', { reason: 'error' })).toBe(1);
    expect(monitored.result).toEqual({ score: 72 });
  });

  it('direct checkOutput calls (the ai-worker.ts job-output path) do not move the call-site counters', async () => {
    const checker = new HallucinationChecker(defaultHallucinationConfig);
    await checker.checkOutput({
      id: 'job-1',
      model: 'litellm-proxy',
      inputContext: 'ctx text here',
      output: 'output text here',
    });
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.hallucination.checks')).toBe(0);
    expect(total(all, 'intelliflow.ai.hallucination.skipped')).toBe(0);
  });
});

describe('error path', () => {
  it('records outcome=error with a classified class, rethrows, and records nothing else', async () => {
    const recordSample = vi.spyOn(config.driftDetector, 'recordSample');
    const recordValue = vi.spyOn(config.roiTracker, 'recordValueByType');
    const err = Object.assign(new Error('upstream timed out'), { name: 'TimeoutError' });
    await expect(
      withMonitoring(async () => Promise.reject(err), config, FULL_CONTEXT)
    ).rejects.toBe(err);
    const all = await collectMetrics(reader);
    expect(
      total(all, 'intelliflow.ai.inference.count', { outcome: 'error', error_class: 'timeout' })
    ).toBe(1);
    expect(total(all, 'intelliflow.ai.inference.count', { outcome: 'success' })).toBe(0);
    expect(recordSample).not.toHaveBeenCalled();
    expect(recordValue).not.toHaveBeenCalled();
    expect(checkOutput).not.toHaveBeenCalled();
    expect(total(all, 'intelliflow.ai.hallucination.checks')).toBe(0);
  });
});

describe('recording never changes the chain result', () => {
  it('a throwing meter leaves the result intact', async () => {
    const throwing = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error('meter down');
        },
      }
    );
    __setMeterForTests(throwing as never);
    const monitored = await withMonitoring(
      async () => ({ score: 72, confidence: 0.9 }),
      config,
      FULL_CONTEXT
    );
    expect(monitored.result).toEqual({ score: 72, confidence: 0.9 });
  });
});
