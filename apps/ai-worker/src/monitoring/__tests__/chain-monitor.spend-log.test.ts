/**
 * A failed spend recording is logged by error class only: a provider or usage error can echo
 * prompt or lead content, and no AI log line may carry error text (IFC-117 NF-002).
 */
import { describe, expect, it, vi } from 'vitest';

const pinoLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock('pino', () => ({ default: () => pinoLogger }));

import { createChainMonitor, withMonitoring } from '../chain-monitor';

describe('withMonitoring — spend recording failure log', () => {
  it('logs the error class, never the error message', async () => {
    const canary = ['lead', 'canary', 'example.invalid'].join('-');
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
});
