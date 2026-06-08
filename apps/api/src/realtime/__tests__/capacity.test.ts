/**
 * Realtime capacity evaluator tests — issue #318 (caveat 3b).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  getRealtimeCapacityConfig,
  evaluateRealtimeCapacity,
  logCapacityIfChanged,
  type RealtimeCapacityEvaluation,
} from '../capacity';

describe('getRealtimeCapacityConfig', () => {
  it('defaults to max 200 with 75% / 90% thresholds', () => {
    const config = getRealtimeCapacityConfig({} as NodeJS.ProcessEnv);
    expect(config).toEqual({ max: 200, warnAt: 150, criticalAt: 180 });
  });

  it('honours env overrides', () => {
    const config = getRealtimeCapacityConfig({
      REALTIME_MAX_CONNECTIONS: '500',
      REALTIME_WARN_CONNECTIONS: '300',
      REALTIME_CRITICAL_CONNECTIONS: '450',
    } as unknown as NodeJS.ProcessEnv);
    expect(config).toEqual({ max: 500, warnAt: 300, criticalAt: 450 });
  });

  it('ignores invalid env values and falls back', () => {
    const config = getRealtimeCapacityConfig({
      REALTIME_MAX_CONNECTIONS: 'not-a-number',
      REALTIME_WARN_CONNECTIONS: '-5',
    } as unknown as NodeJS.ProcessEnv);
    expect(config).toEqual({ max: 200, warnAt: 150, criticalAt: 180 });
  });
});

describe('evaluateRealtimeCapacity', () => {
  const config = { max: 200, warnAt: 150, criticalAt: 180 };

  it('reports ok below the warn threshold', () => {
    const e = evaluateRealtimeCapacity(100, config);
    expect(e.status).toBe('ok');
    expect(e.connections).toBe(100);
    expect(e.headroom).toBe(100);
    expect(e.utilization).toBeCloseTo(0.5);
  });

  it('reports warning at/above the warn threshold', () => {
    expect(evaluateRealtimeCapacity(150, config).status).toBe('warning');
    expect(evaluateRealtimeCapacity(179, config).status).toBe('warning');
  });

  it('reports critical at/above the critical threshold', () => {
    expect(evaluateRealtimeCapacity(180, config).status).toBe('critical');
    expect(evaluateRealtimeCapacity(199, config).status).toBe('critical');
  });

  it('clamps headroom at zero and exceeds 100% utilization when over the cap', () => {
    const e = evaluateRealtimeCapacity(250, config);
    expect(e.status).toBe('critical');
    expect(e.headroom).toBe(0);
    expect(e.utilization).toBeGreaterThan(1);
  });

  it('treats negative / NaN connection counts as zero', () => {
    expect(evaluateRealtimeCapacity(-10, config).connections).toBe(0);
    expect(evaluateRealtimeCapacity(Number.NaN, config).connections).toBe(0);
    expect(evaluateRealtimeCapacity(-10, config).status).toBe('ok');
  });

  it('uses the default config when none is provided', () => {
    const e = evaluateRealtimeCapacity(10);
    expect(e.max).toBe(200);
    expect(e.status).toBe('ok');
  });
});

describe('logCapacityIfChanged', () => {
  const mkLogger = () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() });
  const evalAt = (status: RealtimeCapacityEvaluation['status']): RealtimeCapacityEvaluation => ({
    connections: 160,
    max: 200,
    utilization: 0.8,
    headroom: 40,
    status,
  });

  it('does not log when the status is unchanged', () => {
    const logger = mkLogger();
    const next = logCapacityIfChanged(evalAt('warning'), 'warning', logger);
    expect(next).toBe('warning');
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('warns when transitioning to warning', () => {
    const logger = mkLogger();
    expect(logCapacityIfChanged(evalAt('warning'), 'ok', logger)).toBe('warning');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('status=warning'));
  });

  it('errors when transitioning to critical', () => {
    const logger = mkLogger();
    expect(logCapacityIfChanged(evalAt('critical'), 'warning', logger)).toBe('critical');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('status=critical'));
  });

  it('logs recovery to ok', () => {
    const logger = mkLogger();
    expect(logCapacityIfChanged(evalAt('ok'), 'critical', logger)).toBe('ok');
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('status=ok'));
  });
});
