/**
 * API logger tests (IFC-074)
 *
 * `getApiLogger()` must create its pino logger lazily: the OTel pino
 * instrumentation patches `pino()` at call time, so a logger built when this
 * module is imported (before `instrument.ts` starts the SDK) would never export
 * its records. `createLogger` is mocked here; the real record and OTLP export
 * are covered in packages/observability (logging.test.ts, pino-otlp.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.unmock('./logger');

const { createLogger, fakeLogger } = vi.hoisted(() => {
  const fakeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { createLogger: vi.fn((_config: unknown) => fakeLogger), fakeLogger };
});

vi.mock('@intelliflow/observability', () => ({
  createLogger: (config: unknown) => createLogger(config),
}));

describe('getApiLogger', () => {
  beforeEach(() => {
    vi.resetModules();
    createLogger.mockReset();
    createLogger.mockImplementation(() => fakeLogger);
    vi.stubEnv('OTEL_SERVICE_NAME', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not create a logger when the module is imported', async () => {
    await import('./logger.js');

    expect(createLogger).not.toHaveBeenCalled();
  });

  it('creates the logger once, on first use, and reuses it', async () => {
    const { getApiLogger } = await import('./logger.js');

    const first = getApiLogger();
    const second = getApiLogger();

    expect(first).toBe(fakeLogger);
    expect(second).toBe(first);
    expect(createLogger).toHaveBeenCalledTimes(1);
  });

  it('names the logger after OTEL_SERVICE_NAME when set', async () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'api');
    const { getApiLogger } = await import('./logger.js');

    getApiLogger();

    expect(createLogger).toHaveBeenCalledWith({ name: 'api' });
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('falls back to intelliflow-api when OTEL_SERVICE_NAME is %s', async (_label, value) => {
    if (value === undefined) {
      delete process.env.OTEL_SERVICE_NAME;
    } else {
      vi.stubEnv('OTEL_SERVICE_NAME', value);
    }
    const { getApiLogger } = await import('./logger.js');

    getApiLogger();

    expect(createLogger).toHaveBeenCalledWith({ name: 'intelliflow-api' });
  });

  it('apiLog writes the record through the logger at the given level', async () => {
    const { apiLog } = await import('./logger.js');

    apiLog('warn', { type: 'trpc.slow' }, 'slow trpc request');

    expect(fakeLogger.warn).toHaveBeenCalledWith({ type: 'trpc.slow' }, 'slow trpc request');
  });

  it('apiLog swallows a logger that cannot be built and reports it once', async () => {
    createLogger.mockImplementation(() => {
      throw new Error('unknown level INFO');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { apiLog } = await import('./logger.js');

    expect(() => apiLog('info', { type: 'trpc.request' }, 'trpc request')).not.toThrow();
    expect(() => apiLog('error', { type: 'trpc.error' }, 'trpc error')).not.toThrow();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toContain('unknown level INFO');
  });

  it('apiLog swallows a write that throws', async () => {
    fakeLogger.error.mockImplementationOnce(() => {
      throw 'not an error object';
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { apiLog } = await import('./logger.js');

    expect(() => apiLog('error', { type: 'trpc.error' }, 'trpc error')).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(
      '[api-logger] structured logging unavailable: unknown error'
    );
  });

  it('resetApiLoggerForTests forces a new logger on the next call', async () => {
    const { getApiLogger, resetApiLoggerForTests } = await import('./logger.js');

    getApiLogger();
    resetApiLoggerForTests();
    getApiLogger();

    expect(createLogger).toHaveBeenCalledTimes(2);
  });
});
