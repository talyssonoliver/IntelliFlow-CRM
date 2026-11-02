/**
 * withMonitoring's failure logs carry an error class only: a provider or usage error can echo
 * prompt or lead content, and no AI log line may carry error text (IFC-117 NF-002).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pinoLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock('pino', () => ({ default: () => pinoLogger }));

import { createChainMonitor, withMonitoring } from '../chain-monitor';

const canary = ['lead', 'canary', 'example.invalid'].join('-');
const logsFor = (message: string) =>
  [...pinoLogger.error.mock.calls, ...pinoLogger.warn.mock.calls].filter(([, msg]) =>
    String(msg).includes(message)
  );

describe('withMonitoring — failure logs', () => {
  beforeEach(() => {
    pinoLogger.error.mockClear();
    pinoLogger.warn.mockClear();
  });

  it('logs a failed spend recording by error class, never the error message', async () => {
    const config = createChainMonitor().getConfig();

    await withMonitoring(async () => ({ score: 50 }), config, {
      chain: 'lead_scoring',
      modelName: 'scoring-free',
      getUsage: () => {
        throw new Error(`usage read failed for ${canary}`);
      },
    });

    const spendLogs = pinoLogger.error.mock.calls.filter(([, msg]) =>
      String(msg).includes('Recording AI spend failed')
    );
    expect(spendLogs).toHaveLength(1);
    expect(JSON.stringify(spendLogs)).not.toContain(canary);
    expect(spendLogs[0][0]).toMatchObject({ errorClass: 'other' });
  });

  it('logs a chain failure by error class, never the error message', async () => {
    const config = createChainMonitor().getConfig();

    await expect(
      withMonitoring(
        async () => {
          throw new Error(`provider echoed ${canary}`);
        },
        config,
        { chain: 'lead_scoring', modelName: 'scoring-free' }
      )
    ).rejects.toThrow();

    const logs = logsFor('Chain execution failed');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(canary);
    expect(logs[0][0]).toMatchObject({ errorClass: 'other' });
  });

  it('logs a failed hallucination check by error class, never the error message', async () => {
    const config = createChainMonitor().getConfig();
    vi.spyOn(config.hallucinationChecker, 'checkOutput').mockRejectedValue(
      new Error(`checker echoed ${canary}`)
    );

    await withMonitoring(async () => ({ score: 50 }), config, {
      chain: 'lead_scoring',
      modelName: 'scoring-free',
      inputContext: 'Company: Example Ltd, title: buyer',
      extractText: () => 'A sufficiently long explanation of why this lead scored fifty points.',
    });

    const logs = logsFor('Hallucination check failed');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(canary);
    expect(logs[0][0]).toMatchObject({ errorClass: 'other' });
  });
});
