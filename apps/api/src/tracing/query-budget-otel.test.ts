import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks so they are in place during module load.
const { counter, histogram, getMeter, setQueryBudgetEmitter, restoreFn } = vi.hoisted(() => {
  const counter = { add: vi.fn() };
  const histogram = { record: vi.fn() };
  const restoreFn = vi.fn();
  return {
    counter,
    histogram,
    restoreFn,
    getMeter: vi.fn((..._args: unknown[]) => ({
      createCounter: vi.fn(() => counter),
      createHistogram: vi.fn(() => histogram),
    })),
    // Capture the emitter the module installs so the test can fire it directly.
    setQueryBudgetEmitter: vi.fn((..._args: unknown[]) => restoreFn),
  };
});

vi.mock('@opentelemetry/api', () => ({
  metrics: { getMeter: (...args: unknown[]) => getMeter(...args) },
}));

vi.mock('@intelliflow/db', () => ({
  setQueryBudgetEmitter: (fn: unknown) => setQueryBudgetEmitter(fn),
}));

const sampleEvent = {
  type: 'query-budget.exceeded' as const,
  requestId: 'req-1',
  route: 'trpc.query.experiment.list',
  method: 'query',
  context: 'request',
  queryCount: 9,
  queryBudget: 2,
  exceeded: true as const,
  model: 'experiment',
  action: 'count',
  durationMs: 3,
  repeatedQueryFingerprint: 'Experiment.count()',
  repeatedQueryCount: 7,
  timestamp: '2026-05-31T11:00:00.000Z',
  environment: 'test',
};

describe('query-budget OTel emitter wiring (ADR-053)', () => {
  beforeEach(() => {
    vi.resetModules();
    counter.add.mockClear();
    histogram.record.mockClear();
    getMeter.mockClear();
    setQueryBudgetEmitter.mockClear();
    restoreFn.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs an emitter that forwards over-budget events to a counter + histogram', async () => {
    const { installQueryBudgetOtelEmitter } = await import('./query-budget-otel.js');

    const restore = installQueryBudgetOtelEmitter();
    expect(getMeter).toHaveBeenCalledWith('intelliflow-db-query-budget', '0.1.0');
    expect(setQueryBudgetEmitter).toHaveBeenCalledTimes(1);
    expect(restore).toBe(restoreFn);

    // Fire the emitter that the module handed to setQueryBudgetEmitter.
    const emitter = setQueryBudgetEmitter.mock.calls[0]?.[0] as (e: typeof sampleEvent) => void;
    emitter(sampleEvent);

    expect(counter.add).toHaveBeenCalledWith(1, {
      route: 'trpc.query.experiment.list',
      context: 'request',
      method: 'query',
      environment: 'test',
    });
    expect(histogram.record).toHaveBeenCalledWith(9, {
      route: 'trpc.query.experiment.list',
      context: 'request',
      method: 'query',
      environment: 'test',
    });
    // Preserves the structured warn line.
    expect(console.warn).toHaveBeenCalledWith(JSON.stringify(sampleEvent));
  });

  it('falls back to "unknown" route/method when the event omits them', async () => {
    const { installQueryBudgetOtelEmitter } = await import('./query-budget-otel.js');
    installQueryBudgetOtelEmitter();
    const emitter = setQueryBudgetEmitter.mock.calls[0]?.[0] as (e: unknown) => void;

    emitter({ context: 'background', queryCount: 51, environment: 'production' });

    expect(counter.add).toHaveBeenCalledWith(1, {
      route: 'unknown',
      context: 'background',
      method: 'unknown',
      environment: 'production',
    });
    expect(histogram.record).toHaveBeenCalledWith(
      51,
      expect.objectContaining({ route: 'unknown' })
    );
  });

  it('is idempotent — a second install does not re-register the emitter', async () => {
    const { installQueryBudgetOtelEmitter } = await import('./query-budget-otel.js');
    const first = installQueryBudgetOtelEmitter();
    const second = installQueryBudgetOtelEmitter();
    expect(setQueryBudgetEmitter).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('uninstall restores the previous emitter and allows re-install', async () => {
    const { installQueryBudgetOtelEmitter, uninstallQueryBudgetOtelEmitter } =
      await import('./query-budget-otel.js');
    installQueryBudgetOtelEmitter();
    uninstallQueryBudgetOtelEmitter();
    expect(restoreFn).toHaveBeenCalledTimes(1);
    // After uninstall, installing again registers a fresh emitter.
    installQueryBudgetOtelEmitter();
    expect(setQueryBudgetEmitter).toHaveBeenCalledTimes(2);
  });
});
