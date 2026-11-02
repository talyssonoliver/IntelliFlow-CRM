/**
 * IFC-117: production wiring of the AI metrics facade.
 *
 * In production the meter comes from the global MeterProvider that ai-worker's NodeSDK
 * registers (tracing/otel.ts). This proves the facade's default path reaches whatever provider
 * is global — through the same aliased @opentelemetry/api copy the app uses — and that no
 * production file creates a second provider via packages/observability's initMetrics().
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { metrics } from '@opentelemetry/api';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  collectMetrics,
  createTestProvider,
  total,
  type TestMetricReader,
} from './otel-test-reader';

let provider: MeterProvider;
let reader: TestMetricReader;

beforeAll(() => {
  ({ provider, reader } = createTestProvider());
  metrics.disable();
  expect(metrics.setGlobalMeterProvider(provider)).toBe(true);
});

afterAll(async () => {
  const { __resetAiMetricsForTests } = await import('../otel-ai-metrics');
  __resetAiMetricsForTests();
  await provider.shutdown();
  metrics.disable();
});

describe('global meter wiring', () => {
  it('records through the global provider when no test meter is set', async () => {
    const facade = await import('../otel-ai-metrics');
    facade.__setMeterForTests(null);
    facade.__resetAiMetricsForTests();
    facade.recordInference({
      model: 'scoring-free',
      chain: 'lead_scoring',
      outcome: 'success',
      latencyMs: 12,
    });
    const all = await collectMetrics(reader);
    expect(
      total(all, 'intelliflow.ai.inference.count', { model: 'scoring-free', outcome: 'success' })
    ).toBe(1);
  });
});

describe('no second meter provider', () => {
  const SRC = join(__dirname, '..', '..');

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        out.push(...walk(full));
      } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  /** True when a code line (not a comment or JSDoc line) names initMetrics. */
  function usesInitMetrics(src: string): boolean {
    return src.split('\n').some((line) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
      return t.split('//')[0].includes('initMetrics');
    });
  }

  it('no non-test ai-worker source imports or calls initMetrics', () => {
    const offenders = walk(SRC).filter((file) => usesInitMetrics(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('the check flags real imports and calls but not comments', () => {
    expect(usesInitMetrics("import { initMetrics } from '@intelliflow/observability';")).toBe(true);
    expect(usesInitMetrics('import {\n  initMetrics,\n} from "x";')).toBe(true);
    expect(usesInitMetrics('  initMetrics({ serviceName: "a" });')).toBe(true);
    expect(
      usesInitMetrics(
        '// never call initMetrics here\n * initMetrics() in JSDoc\n/* initMetrics */'
      )
    ).toBe(false);
  });
});
