/**
 * IFC-117: a REAL LeadScoringChain call records the AI metrics through the global OTel meter.
 *
 * Nothing in the chain is mocked: the real ChatOpenAI (factory `mock` provider) talks to a fake
 * fetch that returns an OpenAI chat.completion with usage tokens, so LangChain's structured
 * output, the token-usage callback, withMonitoring, the hallucination checker and the ROI
 * tracker all run for real. Only the network and the DB-backed cost tracker are faked.
 *
 * Guards against a fake pass: scoreLead swallows errors into score 0 / 'error:v1', so every
 * success case also asserts score > 0, modelVersion !== 'error:v1' and exactly one fetch.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { metrics } from '@opentelemetry/api';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  collectMetrics,
  createTestProvider,
  pointsWhere,
  total,
  type CollectedMetric,
  type TestMetricReader,
} from '../../monitoring/__tests__/otel-test-reader';

// Built at runtime: plain words, nothing shaped like a credential.
const EMAIL_LOCAL = ['jane', 'canary', 'lead'].join('.');
const LEAD_EMAIL = `${EMAIL_LOCAL}@example.invalid`;
const REASONING_MARKER = ['REASONING', 'MARKER', 'b'.repeat(8)].join('_');
const OPERATION_ID_PATTERN = /^[a-z0-9]+-[a-z0-9]{6}$/;

// scoring-free is priced at $0.00005 / $0.00008 per 1K tokens (config/ai.config.ts).
const PROMPT_TOKENS = 2000;
const COMPLETION_TOKENS = 500;
const EXPECTED_COST_USD = 0.00014;

const LEAD = {
  email: LEAD_EMAIL,
  firstName: 'Jane',
  lastName: 'Example',
  company: 'Example Corp',
  title: 'VP Sales',
  source: 'WEBSITE',
};

function completion(body: unknown) {
  return Response.json({
    id: 'chatcmpl-ifc117',
    object: 'chat.completion',
    created: 0,
    model: 'scoring-free',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(body) },
      },
    ],
    usage: {
      prompt_tokens: PROMPT_TOKENS,
      completion_tokens: COMPLETION_TOKENS,
      total_tokens: PROMPT_TOKENS + COMPLETION_TOKENS,
    },
  });
}

const SCORE_BODY = {
  score: 72,
  confidence: 0.86,
  factors: [
    {
      name: 'Engagement',
      impact: 20,
      reasoning: `Inbound demo request from a VP Sales at Example Corp ${REASONING_MARKER}`,
    },
  ],
  modelVersion: 'llm-supplied',
};

let provider: MeterProvider;
let reader: TestMetricReader;
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(() => {
  ({ provider, reader } = createTestProvider());
  metrics.disable();
  expect(metrics.setGlobalMeterProvider(provider)).toBe(true);
});

afterAll(async () => {
  await provider.shutdown();
  metrics.disable();
});

async function loadChain(options: { recordDrift?: boolean } = {}) {
  vi.resetModules();
  vi.doMock('../../utils/cost-tracker', () => ({
    costTracker: { recordUsage: vi.fn(), assertWithinDailyLimit: vi.fn(), addListener: vi.fn() },
  }));
  vi.doMock('../../config/ai.config', async () => {
    const actual =
      await vi.importActual<typeof import('../../config/ai.config')>('../../config/ai.config');
    return {
      ...actual,
      aiConfig: {
        ...actual.aiConfig,
        provider: 'mock',
        costTracking: { ...actual.aiConfig.costTracking, enabled: false },
      },
    };
  });
  const factory = await import('../../lib/llm-factory');
  factory.__resetFactoryCache();
  const monitoring = await import('../../monitoring/chain-monitor');
  const facade = await import('../../monitoring/otel-ai-metrics');
  facade.__resetAiMetricsForTests();
  // A fresh monitor per test: the module singletons would otherwise carry state between cases.
  const fresh = monitoring.createChainMonitor({
    driftDetector: new (await import('../../monitoring/drift-detector')).DriftDetector(
      (await import('../../monitoring/drift-detector')).defaultDriftConfig
    ),
    roiTracker: new (await import('../../monitoring/roi-tracker')).ROITracker(
      (await import('../../monitoring/roi-tracker')).defaultROIConfig
    ),
  });
  vi.spyOn(monitoring.chainMonitor, 'getConfig').mockReturnValue(fresh.getConfig());
  const { LeadScoringChain } = await import('../scoring.chain');
  return {
    chain: new LeadScoringChain({ provider: 'mock', ...options }),
    config: fresh.getConfig(),
  };
}

beforeEach(async () => {
  fetchMock = vi.fn(async () => completion(SCORE_BODY));
  vi.stubGlobal('fetch', fetchMock);
  await collectMetrics(reader); // discard anything from a previous case
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../../utils/cost-tracker');
  vi.doUnmock('../../config/ai.config');
});

function assertNoLeaks(all: CollectedMetric[]): void {
  const dump = JSON.stringify(all);
  expect(dump).not.toContain(EMAIL_LOCAL);
  expect(dump).not.toContain(REASONING_MARKER);
  for (const m of all) {
    for (const p of m.points) {
      for (const v of Object.values(p.attributes))
        expect(String(v)).not.toMatch(OPERATION_ID_PATTERN);
    }
  }
}

describe('LeadScoringChain -> OTel (real chain, fake network)', () => {
  it('records latency, count, cost, estimated value, confidence and a hallucination check', async () => {
    const { chain } = await loadChain();
    const result = await chain.scoreLead(LEAD);

    expect(result.score).toBeGreaterThan(0);
    expect(result.modelVersion).not.toBe('error:v1');
    expect(result.modelVersion.startsWith('mock:')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { response_format?: { type?: string } };
    expect(body.response_format?.type).toBe('json_schema');

    const all = await collectMetrics(reader);
    const success = { model: 'scoring-free', chain: 'lead_scoring', outcome: 'success' };
    expect(
      pointsWhere(all, 'intelliflow.ai.inference.count', { outcome: 'error' }).filter(
        (p) => p.value > 0
      )
    ).toHaveLength(0);
    expect(total(all, 'intelliflow.ai.inference.latency', success)).toBe(1);
    expect(total(all, 'intelliflow.ai.inference.count', success)).toBe(1);
    expect(
      pointsWhere(all, 'intelliflow.ai.cost.usd', {
        model: 'scoring-free',
        chain: 'lead_scoring',
      })[0].value
    ).toBeCloseTo(EXPECTED_COST_USD, 9);
    expect(
      total(all, 'intelliflow.ai.value.estimated.usd', {
        chain: 'lead_scoring',
        value_type: 'lead_scored',
      })
    ).toBe(0.5);
    expect(
      total(all, 'intelliflow.ai.confidence', { model: 'scoring-free', chain: 'lead_scoring' })
    ).toBe(1);
    expect(
      total(all, 'intelliflow.ai.hallucination.checks', {
        model: 'scoring-free',
        chain: 'lead_scoring',
      })
    ).toBe(1);
    assertNoLeaks(all);
  });

  it('two concurrent calls record two latency points and exactly twice the cost', async () => {
    const { chain } = await loadChain();
    const results = await Promise.all([chain.scoreLead(LEAD), chain.scoreLead(LEAD)]);
    expect(results.every((r) => r.score > 0 && r.modelVersion !== 'error:v1')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.inference.latency', { outcome: 'success' })).toBe(2);
    expect(pointsWhere(all, 'intelliflow.ai.cost.usd')[0].value).toBeCloseTo(
      2 * EXPECTED_COST_USD,
      9
    );
  });

  it('records the provider error as outcome=error with no value, drift sample or hallucination check', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ error: { message: 'bad request' } }, { status: 400 })
    );
    const { chain, config } = await loadChain();
    const recordSample = vi.spyOn(config.driftDetector, 'recordSample');
    const result = await chain.scoreLead(LEAD);

    expect(result.modelVersion).toBe('error:v1');
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.inference.count', { outcome: 'error' })).toBe(1);
    expect(total(all, 'intelliflow.ai.value.estimated.usd')).toBe(0);
    expect(total(all, 'intelliflow.ai.hallucination.checks')).toBe(0);
    expect(recordSample).not.toHaveBeenCalled();
    assertNoLeaks(all);
  });

  it('counts an error raised before withMonitoring exactly once (outer catch)', async () => {
    const { chain } = await loadChain();
    // Make prompt formatting throw: this happens before the monitored LLM call.
    vi.spyOn(
      (chain as unknown as { prompt: { format: () => Promise<string> } }).prompt,
      'format'
    ).mockRejectedValue(new Error('prompt broke'));
    const result = await chain.scoreLead(LEAD);
    expect(result.modelVersion).toBe('error:v1');
    expect(fetchMock).not.toHaveBeenCalled();
    const all = await collectMetrics(reader);
    expect(
      total(all, 'intelliflow.ai.inference.count', { outcome: 'error', error_class: 'other' })
    ).toBe(1);
  });

  it('a fallback-provider chain (recordDrift: false) records no drift sample but still records the inference', async () => {
    const { chain, config } = await loadChain({ recordDrift: false });
    const recordSample = vi.spyOn(config.driftDetector, 'recordSample');
    const result = await chain.scoreLead(LEAD);
    expect(result.score).toBeGreaterThan(0);
    expect(recordSample).not.toHaveBeenCalled();
    const all = await collectMetrics(reader);
    expect(total(all, 'intelliflow.ai.inference.count', { outcome: 'success' })).toBe(1);
  });
});
