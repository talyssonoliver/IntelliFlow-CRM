/**
 * Logging must never fail or change a request (IFC-074).
 *
 * Uses the REAL ./logger (the global spy from src/test/setup.ts is unmocked)
 * with a `createLogger` that throws the way pino does for an unknown LOG_LEVEL.
 * A request that succeeded must still succeed, a failing request must still
 * surface its own error, and the span must always end.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.unmock('./logger');

const { span, tracer, captureException } = vi.hoisted(() => {
  const span = {
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
  };
  return {
    span,
    tracer: {
      startActiveSpan: vi.fn((_n: string, _o: unknown, fn: (s: unknown) => unknown) => fn(span)),
    },
    captureException: vi.fn(),
  };
});

vi.mock('@intelliflow/observability', () => ({
  createLogger: () => {
    throw new Error('unknown level INFO');
  },
}));

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: () => tracer, getActiveSpan: () => undefined },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

vi.mock('./sentry', () => ({
  captureException: (err: unknown) => captureException(err),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
}));

class MockTRPCError extends Error {
  code: string;
  constructor({ code, message }: { code: string; message: string }) {
    super(message);
    this.code = code;
  }
}

vi.mock('@trpc/server', () => ({
  TRPCError: MockTRPCError,
  initTRPC: {
    context: () => ({
      create: () => ({ middleware: (fn: unknown) => fn, procedure: { use: (mw: unknown) => mw } }),
    }),
  },
}));

describe('tracingMiddleware when structured logging is unavailable', () => {
  beforeEach(async () => {
    vi.resetModules();
    span.end.mockClear();
    captureException.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { resetApiLoggerForTests } = await import('./logger.js');
    resetApiLoggerForTests();
  });

  it('still returns the result of a successful procedure and ends the span', async () => {
    const { tracingMiddleware } = await import('./middleware.js');

    const result = await (tracingMiddleware as any)({
      path: 'lead.create',
      type: 'mutation',
      next: async () => ({ ok: true }),
      ctx: {},
    });

    expect(result).toEqual({ ok: true });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('still rethrows the original error, captures it and ends the span', async () => {
    const { tracingMiddleware } = await import('./middleware.js');
    const original = new MockTRPCError({ code: 'BAD_REQUEST', message: 'bad input' });

    await expect(
      (tracingMiddleware as any)({
        path: 'lead.create',
        type: 'mutation',
        next: async () => {
          throw original;
        },
        ctx: {},
      })
    ).rejects.toBe(original);

    expect(span.end).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(original);
  });
});
